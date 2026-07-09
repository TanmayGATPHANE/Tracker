// PhonePe statement PDF → expense rows.
//
// Two-stage: extractTextFromPdf() turns the PDF into a block of line text with
// pdf.js; parsePhonePeTransactions() walks those lines and pulls out debit rows
// of { date, amount, note, direction }. guessCategory() maps a merchant note to
// one of the user's existing categories by keyword.
//
// IMPORTANT: the row-splitting regex below is a best guess based on the common
// PhonePe statement layout. It is deliberately conservative and surfaces any
// lines it couldn't parse via `unparsedLines` so the parser can be tuned against
// a real sample without rebuilding the whole flow.

// Lazily load pdf.js only when a PDF is actually parsed, so the heavy core
// library + worker don't bloat the main bundle for users who never use this
// feature. Vite emits the worker as a separate chunk via the
// `new URL(..., import.meta.url)` idiom — no manual copy or CDN needed.
let pdfjsPromise = null
async function ensurePdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      return lib
    })
  }
  return pdfjsPromise
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/// Extract text from a PDF File/Blob, returning one string with `\n`-separated
/// visual lines (top-to-bottom, left-to-right within a line).
export async function extractTextFromPdf(file) {
  const pdfjsLib = await ensurePdfjs()
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const lines = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()

    // Group text items by their y-coordinate (transform[5]) so each visual line
    // is one bucket. Round to ~2px to tolerate sub-pixel drift within a row.
    const byY = new Map()
    for (const item of content.items) {
      if (!item.str || !item.transform) continue
      const y = Math.round(item.transform[5] / 2) * 2
      const x = item.transform[4]
      const bucket = byY.get(y) || []
      bucket.push({ x, str: item.str })
      byY.set(y, bucket)
    }

    // PDF coordinate origin is bottom-left, so larger y = higher on the page.
    // Sort lines top-to-bottom (descending y), items left-to-right (ascending x).
    const ys = [...byY.keys()].sort((a, b) => b - a)
    for (const y of ys) {
      const parts = byY.get(y).sort((a, b) => a.x - b.x).map(p => p.str)
      const line = parts.join(' ').replace(/\s+/g, ' ').trim()
      if (line) lines.push(line)
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Date normalization
// ---------------------------------------------------------------------------

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

function pad2(n) { return String(n).padStart(2, '0') }

/// Parse a date token into `YYYY-MM-DD`. Supports `12 Jun 2024`, `12 June 2024`,
/// and Indian `DD/MM/YYYY` / `DD-MM-YYYY`. Returns null if it can't.
function normalizeDate(token) {
  if (!token) return null
  const s = token.trim()

  // DD/MM/YYYY or DD-MM-YYYY (Indian day-first)
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return validYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null
  }

  // DD MMM YYYY / DD MMMMM YYYY
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/)
  if (m) {
    const d = +m[1], mo = MONTHS[m[2].toLowerCase()], y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (mo && validYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // MMM DD, YYYY — PhonePe's format, e.g. "Jun 28, 2026".
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()], d = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (mo && validYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  return null
}

function validYmd(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  return y > 1900 && y < 2100
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

// Date: PhonePe uses "Jun 28, 2026" (MMM DD, YYYY). Also accept DD MMM YYYY
// and DD/MM/YYYY as fallbacks in case the format varies.
const DATE_RE = /([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/
// Amount: always ₹-prefixed in PhonePe statements; decimals optional (₹ 415,
// ₹ 5,000, ₹ 1,479.05). Requiring ₹ avoids matching the date's day/year.
const AMOUNT_RE = /₹\s?([\d,]+(?:\.\d{1,2})?)/g

/// Markers stripped from the note (direction + "Paid to"/"Payment to" prefixes).
const NOTE_STRIP_RE = /\b(paid to|payment to|sent to|received from|debited|credited|debit|credit|dr\.?|cr\.?)\b/gi

/// Heuristics for transaction direction. "debit" = money sent (an expense),
/// "credit" = money received (excluded from this expense-only tracker).
function detectDirection(line) {
  const l = line.toLowerCase()
  // Credit markers first — "received" / "credited" / "CREDIT".
  if (/\b(received|credited|credit|cr\.?|cashback|refund)\b/.test(l)) return 'credit'
  if (/\b(paid to|payment to|debited|debit|dr\.?|sent to|upi debit)\b/.test(l)) return 'debit'
  return null
}

/// Parse extracted text into transaction rows. Debits only.
/// Returns { rows, unparsedLines } where each row is
/// { date: 'YYYY-MM-DD', amount: number, note: string, direction: 'debit' }.
export function parsePhonePeTransactions(text) {
  const lines = text.split('\n')
  const rows = []
  const unparsedLines = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const dateMatch = line.match(DATE_RE)
    if (!dateMatch) continue // not a transaction line

    const date = normalizeDate(dateMatch[1])
    if (!date) { unparsedLines.push(line); continue }

    // Amount: take the last ₹/decimal match on the line (statements put the
    // amount at the end of the row).
    const amounts = [...line.matchAll(AMOUNT_RE)].map(m => m[1])
    if (amounts.length === 0) { unparsedLines.push(line); continue }
    const amount = parseFloat(amounts[amounts.length - 1].replace(/,/g, ''))

    const direction = detectDirection(line)
    if (!direction) { unparsedLines.push(line); continue }
    if (direction === 'credit') continue // debits only

    // Note = everything that isn't the date, amount, or direction marker.
    let note = line
      .replace(dateMatch[0], ' ')
      .replace(AMOUNT_RE, ' ')
      .replace(/₹/g, ' ')
      .replace(NOTE_STRIP_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!note) note = '(no description)'

    rows.push({ date, amount, note, direction })
  }

  return { rows, unparsedLines }
}

// ---------------------------------------------------------------------------
// Category guessing
// ---------------------------------------------------------------------------

/// Keyword → category mapping. Keys are regex fragments matched case-insensitive
/// against the note; value is the category name to pre-fill. Tuned for common
/// Indian UPI merchants. Extend freely.
const CATEGORY_RULES = [
  { re: /\b(zepto|zeptonow|blinkit|instamart|bigbasket|big-basket|dmart|star bazaar|reliance fresh|more supermarket|super mart|super market|kirana|grocery)\b/i, cat: 'Groceries' },
  { re: /\b(swiggy|zomato|eatfit|dominos|pizza|mcdonald|kfc|eat\.fit|magicpin|restaurant|food court|theobroma|bakery|sweets|namkeen)\b/i, cat: 'Food' },
  { re: /\b(uber|ola|rapido|blablacar|irctc|railways|rail app|metro|petrol|hpcl|bpcl|iocl|bharat petroleum|indian oil|fuel|shell|automobiles?|service center)\b/i, cat: 'Transport' },
  { re: /\b(amazon|flipkart|myntra|ajio|meesho|snapdeal|nykaa)\b/i, cat: 'Shopping' },
  { re: /\b(electricity|bescom|tata power|adani electricity|bses|ndpl|water board|borewell|gas|indraprastha gas|mahanagar gas|piped gas|fiber|broadband|air fiber|airtel|jio fiber|internet)\b/i, cat: 'Utilities' },
  { re: /\b(netflix|spotify|prime|hotstar|disney|zee5|sony liv|youtube premium|jio cinema)\b/i, cat: 'Entertainment' },
  { re: /\b(rent|landlord|maintenance|society)\b/i, cat: 'Rent' },
  { re: /\b(pharmacy|apollo|medplus|1mg|pharmeasy|wellness forever|hospital|clinic|lab|diagnostic|doctor|medical)\b/i, cat: 'Health' },
  { re: /\b(salon|spa|barber|beauty|grooming)\b/i, cat: 'Personal' },
  { re: /\b(gym|cult\.fit|fitness|yoga)\b/i, cat: 'Health' },
  { re: /\b(salary|reimburse)\b/i, cat: 'Income' },
]

/// Map a note to a category. Returns the category name if a rule matches AND that
/// category exists in the user's `categories` list; otherwise returns '' so the
/// UI forces the user to pick (rather than silently inventing a category).
export function guessCategory(note, categories) {
  if (!note) return ''
  const have = new Set((categories || []).map(c => (typeof c === 'string' ? c : c.name)))
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(note) && have.has(rule.cat)) return rule.cat
  }
  return ''
}

/// Generate smart category suggestions based on note content when no rules match.
/// Returns an array of suggested categories based on keywords in the note.
export function suggestCategories(note, existingCategories) {
  if (!note) return []

  const suggestions = new Set()
  const noteLower = note.toLowerCase()

  // Common category suggestions based on keywords
  const keywordMap = {
    'transfer': ['Transfers', 'Miscellaneous'],
    'upi': ['Transfers', 'Miscellaneous'],
    'payment': ['Payments', 'Miscellaneous'],
    'paid': ['Payments', 'Miscellaneous'],
    'sent': ['Transfers', 'Miscellaneous'],
    'received': ['Income', 'Miscellaneous'],
    'refund': ['Income', 'Miscellaneous'],
    'cashback': ['Income', 'Miscellaneous'],
    'recharge': ['Utilities', 'Miscellaneous'],
    'bill': ['Utilities', 'Miscellaneous'],
    'subscription': ['Entertainment', 'Miscellaneous'],
    'fee': ['Miscellaneous', 'Other'],
    'charge': ['Miscellaneous', 'Other'],
    'service': ['Services', 'Miscellaneous'],
    'consult': ['Services', 'Miscellaneous'],
    'consulting': ['Services', 'Miscellaneous'],
    'freelance': ['Income', 'Miscellaneous'],
    'salary': ['Income', 'Miscellaneous'],
    'withdraw': ['Transfers', 'Miscellaneous'],
    'atm': ['Transfers', 'Miscellaneous'],
  }

  // Check for keyword matches
  for (const [keyword, cats] of Object.entries(keywordMap)) {
    if (noteLower.includes(keyword)) {
      cats.forEach(cat => suggestions.add(cat))
    }
  }

  // If no specific keywords matched, suggest common categories
  if (suggestions.size === 0) {
    suggestions.add('Miscellaneous')
    suggestions.add('Other')
    suggestions.add('Uncategorized')
  }

  // Filter suggestions to only include existing categories
  const existingSet = new Set(existingCategories.map(c => typeof c === 'string' ? c : c.name))
  const filteredSuggestions = [...suggestions].filter(cat => existingSet.has(cat))

  // If no existing categories match our suggestions, return the first few existing categories
  if (filteredSuggestions.length === 0 && existingCategories.length > 0) {
    return existingCategories.slice(0, 3).map(c => typeof c === 'string' ? c : c.name)
  }

  return filteredSuggestions
}