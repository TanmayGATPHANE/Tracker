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

    public ExpensesController(
        ExpenseRepository expenses,
        CategoryRepository categories,
        BudgetRepository budgets,
        RecurringPostingService poster)
    {
        _expenses = expenses;
        _categories = categories;
        _budgets = budgets;
        _poster = poster;
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
        [FromQuery] int limit = 50)
    {
        // Lazy posting — surfaces any due recurring items before serving reads.
        await _poster.PostDueAsync(DateTime.UtcNow);
        var (from, to) = ResolvePeriod(period);
        var items = await _expenses.ListAsync(from, to, Math.Clamp(limit, 1, 200));
        return Ok(items);
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] string period = "thisMonth")
    {
        await _poster.PostDueAsync(DateTime.UtcNow);
        var (from, to) = ResolvePeriod(period);
        var breakdown  = await _expenses.BreakdownAsync(from, to);
        var total      = breakdown.Sum(b => b.Total);

        // Enrich with budget context (only meaningful for monthly periods).
        var yearMonth = $"{from.Year:D4}-{from.Month:D2}";
        var budgetMap = await _budgets.MapForMonthAsync(yearMonth);

        // Previous-period comparison. Compute the window, fetch its breakdown,
        // then derive per-category delta.
        var (pFrom, pTo) = PreviousPeriod(from, to, period);
        var prevBreakdown = await _expenses.BreakdownAsync(pFrom, pTo);
        var prevTotal     = prevBreakdown.Sum(b => b.Total);
        var prevMap       = prevBreakdown.ToDictionary(b => b.Category, b => b.Total);

        // Per-category delta: (this - prev). null when no prior data.
        static double? PctDiff(int current, int prior)
        {
            if (prior == 0) return null;
            return Math.Round(((double)current - prior) / prior * 1000) / 10;
        }

        var enriched = breakdown.Select(b => {
            var hasBudget = budgetMap.TryGetValue(b.Category, out var cap) && cap > 0;
            var pct = hasBudget ? Math.Round((double)b.Total / cap * 1000) / 10 : (double?)null;
            var prev = prevMap.TryGetValue(b.Category, out var p) ? p : (int?)null;
            var diff = prev.HasValue ? b.Total - prev.Value : (int?)null;
            return new {
                category = b.Category,
                total    = b.Total,
                count    = b.Count,
                budget   = hasBudget ? cap : (int?)null,
                percentOfBudget = pct,
                over     = hasBudget && b.Total > cap,
                previousTotal = prev,
                diff     = diff,
                diffPercent = prev.HasValue ? PctDiff(b.Total, prev.Value) : (double?)null,
            };
        }).ToList();

        var totalBudget = enriched.Where(e => e.budget.HasValue).Sum(e => e.budget!.Value);
        var totalOver   = totalBudget > 0 && total > totalBudget;
        var overCategories = enriched.Where(e => e.over).Select(e => e.category).ToList();

        var previous = new {
            period = PreviousPeriodName(period),
            from   = pFrom,
            to     = pTo,
            total  = prevTotal,
            diff   = total - prevTotal,
            diffPercent = PctDiff(total, prevTotal),
        };

        return Ok(new {
            period, from, to, total,
            breakdown = enriched,
            totalBudget,
            totalOver,
            overCategories,
            previous,
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
            else if (!DateTime.TryParse(r.Date, out var dt))
                err = $"invalid date: {r.Date}";

            if (err == null)
            {
                var dt = DateTime.Parse(r.Date!);
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

    private static (DateTime from, DateTime to) ResolvePeriod(string period)
    {
        var now  = DateTime.UtcNow;
        var utc  = now;
        switch (period.ToLowerInvariant())
        {
            case "lastmonth":
            {
                var first = new DateTime(utc.Year, utc.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-1);
                return (first, first.AddMonths(1));
            }
            case "last7days":
                return (utc.AddDays(-7), utc);
            case "today":
                return (utc.Date, utc.Date.AddDays(1));
            case "thisMonth":
            default:
            {
                var first = new DateTime(utc.Year, utc.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                return (first, first.AddMonths(1));
            }
        }
    }

    /// <summary>Compute the window of equal length immediately preceding the current one.</summary>
    private static (DateTime from, DateTime to) PreviousPeriod(DateTime from, DateTime to, string period)
    {
        var length = to - from;
        return period.ToLowerInvariant() switch
        {
            "lastmonth"  => (from.AddMonths(-1), from),         // month before last-month window
            "last7days"  => (from.AddDays(-7), from),           // the 7 days before the 7-day window
            _            => (from.AddMonths(-1), from),         // default: thisMonth → last month
        };
    }

    private static string PreviousPeriodName(string period) => period.ToLowerInvariant() switch
    {
        "lastmonth" => "the month before",
        "last7days" => "the previous 7 days",
        _           => "last month",
    };
}