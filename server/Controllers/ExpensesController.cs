using System.Globalization;
using ExpenseApi.Models;
using ExpenseApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

[ApiController]
[Route("api/expenses")]
public class ExpensesController : ControllerBase
{
    private readonly ExpenseRepository _expenses;
    private readonly CategoryRepository _categories;
    private readonly BudgetRepository _budgets;
    private readonly RecurringPostingService _poster;
    private readonly SummaryService _summary;

    public ExpensesController(
        ExpenseRepository expenses,
        CategoryRepository categories,
        BudgetRepository budgets,
        RecurringPostingService poster,
        SummaryService summary)
    {
        _expenses = expenses;
        _categories = categories;
        _budgets = budgets;
        _poster = poster;
        _summary = summary;
    }

    public record CreateExpenseDto(int Amount, string Category, string? Note, DateTime? OccurredOn);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateExpenseDto dto)
    {
        if (dto.Amount <= 0)
            return BadRequest(new { error = "amount must be > 0" });
        if (string.IsNullOrWhiteSpace(dto.Category))
            return BadRequest(new { error = "category is required" });

        // Verify category exists (case-insensitive match via repository's exact match).
        var cat = await _categories.GetByNameAsync(dto.Category.Trim());
        if (cat is null)
            return BadRequest(new { error = $"unknown category: {dto.Category}" });

        var expense = new Expense
        {
            Amount     = dto.Amount,
            Category   = cat.Name,
            Note       = dto.Note?.Trim(),
            OccurredOn = dto.OccurredOn ?? DateTime.UtcNow,
            CreatedAt  = DateTime.UtcNow,
        };
        await _expenses.CreateAsync(expense);
        return CreatedAtAction(nameof(GetById), new { id = expense.Id }, expense);
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string period = "thisMonth",
        [FromQuery] int limit = 50,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        // Lazy posting — surfaces any due recurring items before serving reads.
        await _poster.PostDueAsync(DateTime.UtcNow);
        var (fromUtc, toUtc) = (from.HasValue && to.HasValue)
            ? SummaryService.ResolveCustomRange(from.Value, to.Value)
            : SummaryService.ResolvePeriod(period);
        var items = await _expenses.ListAsync(fromUtc, toUtc, Math.Clamp(limit, 1, 200));
        return Ok(items);
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(
        [FromQuery] string period = "thisMonth",
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        var s = await _summary.BuildAsync(period, from, to);
        return Ok(new
        {
            s.Period,
            from = s.From,
            to   = s.To,
            total = s.Total,
            breakdown = s.Breakdown.Select(b => new
            {
                category = b.Category,
                total    = b.Total,
                count    = b.Count,
                budget   = b.Budget,
                percentOfBudget = b.PercentOfBudget,
                over     = b.Over,
                previousTotal = b.PreviousTotal,
                diff     = b.Diff,
                diffPercent = b.DiffPercent,
            }),
            totalBudget = s.TotalBudget,
            totalOver   = s.TotalOver,
            overCategories = s.OverCategories,
            previous = new
            {
                period = s.Previous.Period,
                from   = s.Previous.From,
                to     = s.Previous.To,
                total  = s.Previous.Total,
                diff   = s.Previous.Diff,
                diffPercent = s.Previous.DiffPercent,
            },
        });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var e = await _expenses.GetAsync(id);
        return e is null ? NotFound() : Ok(e);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        await _expenses.DeleteAsync(id);
        return NoContent();
    }

    // ---------- Bulk import ----------

    public record ImportRowDto(
        [property: System.Text.Json.Serialization.JsonPropertyName("amount")] decimal? Amount,
        [property: System.Text.Json.Serialization.JsonPropertyName("category")] string? Category,
        [property: System.Text.Json.Serialization.JsonPropertyName("date")] string? Date,
        [property: System.Text.Json.Serialization.JsonPropertyName("note")] string? Note);

    public record ImportRequest(List<ImportRowDto>? Rows);

    /// <summary>
    /// Bulk-import expenses from a pasted JSON array. Each row is validated
    /// independently — partial success is the norm. Categories are auto-created
    /// when missing. Rows that exactly match an existing (amount, category,
    /// occurredOn, note) tuple are silently skipped (idempotency).
    /// </summary>
    [HttpPost("import")]
    public async Task<IActionResult> Import([FromBody] ImportRequest req)
    {
        if (req?.Rows == null || req.Rows.Count == 0)
            return BadRequest(new { error = "rows array is empty" });

        // Pre-compute the dedup window from the union of all row dates. This
        // avoids querying Mongo per-row. Rows whose dates fall outside any
        // reasonable window still get checked against a wider pre-fetched set.
        var parsed = new List<(int Index, decimal Amount, string Category, DateTime OccurredOn, string? Note, string? Err)>();
        var earliest = DateTime.MaxValue;
        var latest   = DateTime.MinValue;
        var sawValidDate = false;

        for (int i = 0; i < req.Rows.Count; i++)
        {
            var r = req.Rows[i];
            string? err = null;

            if (r.Amount == null || r.Amount <= 0)
                err = "amount must be > 0";
            else if (string.IsNullOrWhiteSpace(r.Category))
                err = "category is required";
            else if (string.IsNullOrWhiteSpace(r.Date))
                err = "date is required";
            else if (!TryParseIsoDate(r.Date, out _))
                err = $"invalid date: {r.Date} (expected YYYY-MM-DD)";

            if (err == null)
            {
                TryParseIsoDate(r.Date, out var dt);
                var occurredOn = DateTime.SpecifyKind(dt.Date, DateTimeKind.Utc);
                if (occurredOn < earliest) { earliest = occurredOn; sawValidDate = true; }
                if (occurredOn > latest)   { latest   = occurredOn; }
                parsed.Add((i, r.Amount!.Value, r.Category!.Trim(), occurredOn, r.Note?.Trim(), null));
            }
            else
            {
                parsed.Add((i, 0, "", default, null, err));
            }
        }

        // Pre-fetch existing tuples for the date range. If there are no valid
        // dates, dedup is skipped (every row is "new").
        var existing = sawValidDate
            ? await _expenses.ExistingTuplesAsync(earliest, latest.AddDays(1))
            : new HashSet<(int, string, DateTime, string)>();

        // Ensure every distinct category exists. Single batch.
        var distinctCats = parsed.Where(p => p.Err == null)
                                 .Select(p => p.Category)
                                 .Distinct(StringComparer.Ordinal)
                                 .ToList();
        foreach (var c in distinctCats)
            await _categories.EnsureAsync(c);

        // Build the inserts. Skip rows that already exist.
        var toInsert = new List<Expense>();
        var seenInThisBatch = new HashSet<(int, string, DateTime, string)>();
        var errors = new List<object>();

        foreach (var p in parsed)
        {
            if (p.Err != null)
            {
                errors.Add(new { row = p.Index, reason = p.Err });
                continue;
            }

            // Round to nearest rupee per the import contract.
            var rounded = (int)Math.Round(p.Amount, MidpointRounding.AwayFromZero);

            var tuple = (rounded, p.Category, p.OccurredOn, p.Note ?? "");
            if (existing.Contains(tuple) || seenInThisBatch.Contains(tuple))
            {
                // Silently skipped — idempotency. Not reported as an error.
                continue;
            }
            seenInThisBatch.Add(tuple);

            toInsert.Add(new Expense
            {
                Amount     = rounded,
                Category   = p.Category,
                Note       = string.IsNullOrEmpty(p.Note) ? null : p.Note,
                OccurredOn = p.OccurredOn,
                CreatedAt  = DateTime.UtcNow,
            });
        }

        if (toInsert.Count > 0)
            await _expenses.CreateManyAsync(toInsert);

        return Ok(new
        {
            imported = toInsert.Count,
            skipped  = parsed.Count(p => p.Err == null) - toInsert.Count,
            errors,
            rowsProcessed = parsed.Count,
        });
    }

    /// <summary>
    /// Parse an import date in strict ISO calendar form (YYYY-MM-DD), invariant
    /// of server culture. Avoids the "07/01" → Jul 1 vs Jan 7 ambiguity that
    /// culture-sensitive TryParse introduces on different host locales.
    /// </summary>
    private static bool TryParseIsoDate(string? s, out DateTime date)
    {
        date = default;
        if (string.IsNullOrWhiteSpace(s)) return false;
        return DateTime.TryParseExact(s!.Trim(), "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }
}