using ExpenseApi.Models;

namespace ExpenseApi.Services;

/// <summary>
/// Lazy auto-posting for recurring expenses. On every read of expenses (list or
/// summary), the server checks whether any active recurring items are due and
/// posts them as real expense entries. The <c>lastPosted</c> field per
/// recurring is the idempotency key — an item is posted at most once per
/// (item, yearMonth) pair, no matter how many concurrent calls happen.
/// </summary>
public class RecurringPostingService
{
    private readonly RecurringRepository _recurring;
    private readonly ExpenseRepository _expenses;

    public RecurringPostingService(RecurringRepository recurring, ExpenseRepository expenses)
    {
        _recurring = recurring;
        _expenses = expenses;
    }

    /// <summary>
    /// Inspect all active recurring items and post any that are due. Backfills
    /// every missed month since the last post (or <see cref="Recurring.StartMonth"/>)
    /// through the current month — so if the app wasn't opened for a few months,
    /// those entries are caught up on the next read instead of being silently
    /// lost. The current month is skipped if its day-of-month hasn't arrived yet.
    /// Each entry's occurredOn is set to that month's dayOfMonth at 12:00 UTC,
    /// so it sorts and groups naturally with manual entries for the same day.
    /// </summary>
    public async Task<PostingResult> PostDueAsync(DateTime nowUtc)
    {
        var result = new PostingResult();
        var currentMonth = $"{nowUtc.Year:D4}-{nowUtc.Month:D2}";
        var items = await _recurring.ListAsync();

        foreach (var r in items)
        {
            if (!r.Active) continue;

            // Months that should have an entry but don't yet.
            var dueMonths = DueMonths(r, nowUtc, currentMonth);
            if (dueMonths.Count == 0) continue;

            // Atomic claim: advance LastPosted to the last month we're about to
            // post. Only the caller that wins this update inserts — concurrent
            // reads don't duplicate. Every month in dueMonths is strictly after
            // the current LastPosted, so this never regresses LastPosted.
            var lastToPost = dueMonths[^1];
            var claimed = await _recurring.MarkPostedAsync(r.Id, lastToPost);
            if (!claimed) continue;

            foreach (var ym in dueMonths)
            {
                var (year, month) = ParseYearMonth(ym);
                // Cap dayOfMonth at the last day of the month (day=31 → Feb 28).
                var day = Math.Min(r.DayOfMonth, DateTime.DaysInMonth(year, month));
                var occurredOn = new DateTime(year, month, day, 12, 0, 0, DateTimeKind.Utc);

                await _expenses.CreateAsync(new Expense
                {
                    Amount     = r.Amount,
                    Category   = r.Category,
                    Note       = r.Note,
                    OccurredOn = occurredOn,
                    CreatedAt  = DateTime.UtcNow,
                });
                result.Posted.Add((r.Category, r.Amount));
            }
        }
        return result;
    }

    /// <summary>
    /// The yearMonths between the last-posted month (exclusive) and the current
    /// month (inclusive) that still need an entry, within the item's start/end
    /// window. The current month is excluded when its day-of-month hasn't arrived
    /// yet. Capped at 24 months so a long-dormant item catches up over a few
    /// reads rather than dumping years of entries in a single call.
    /// </summary>
    private static List<string> DueMonths(Recurring r, DateTime nowUtc, string currentMonth)
    {
        var months = new List<string>();
        var cursor = string.IsNullOrEmpty(r.LastPosted) ? r.StartMonth : NextMonth(r.LastPosted);

        for (int i = 0; i < 24 && string.CompareOrdinal(cursor, currentMonth) <= 0; i++)
        {
            if (string.CompareOrdinal(cursor, r.StartMonth) < 0)
            {
                cursor = NextMonth(cursor);
                continue;
            }
            if (!string.IsNullOrEmpty(r.EndMonth) && string.CompareOrdinal(cursor, r.EndMonth) > 0)
                break;
            if (cursor == currentMonth && r.DayOfMonth > nowUtc.Day)
                break; // not due yet this month

            months.Add(cursor);
            cursor = NextMonth(cursor);
        }
        return months;
    }

    private static string NextMonth(string ym)
    {
        var y = int.Parse(ym.AsSpan(0, 4));
        var m = int.Parse(ym.AsSpan(5, 2));
        if (m == 12) { y++; m = 1; } else m++;
        return $"{y:D4}-{m:D2}";
    }

    private static (int Year, int Month) ParseYearMonth(string ym) =>
        (int.Parse(ym.AsSpan(0, 4)), int.Parse(ym.AsSpan(5, 2)));
}

public class PostingResult
{
    public List<(string Category, int Amount)> Posted { get; } = new();
}