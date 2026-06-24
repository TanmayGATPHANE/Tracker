using ExpenseApi.Models;

namespace ExpenseApi.Services;

/// <summary>
/// Builds the enriched summary payload (totals, breakdown, budget context,
/// month-over-month comparison). Extracted from ExpensesController so the
/// dashboard endpoint can reuse the same logic without duplicating it.
/// </summary>
public class SummaryService
{
    private readonly ExpenseRepository _expenses;
    private readonly BudgetRepository _budgets;
    private readonly RecurringPostingService _poster;

    public SummaryService(
        ExpenseRepository expenses,
        BudgetRepository budgets,
        RecurringPostingService poster)
    {
        _expenses = expenses;
        _budgets  = budgets;
        _poster   = poster;
    }

    public async Task<SummaryResult> BuildAsync(string period)
    {
        await _poster.PostDueAsync(DateTime.UtcNow);
        var (from, to) = ResolvePeriod(period);
        var breakdown  = await _expenses.BreakdownAsync(from, to);
        var total      = breakdown.Sum(b => b.Total);

        // Enrich with budget context (only meaningful for monthly periods).
        var yearMonth = $"{from.Year:D4}-{from.Month:D2}";
        var budgetMap = await _budgets.MapForMonthAsync(yearMonth);

        // Previous-period comparison.
        var (pFrom, pTo) = PreviousPeriod(from, to, period);
        var prevBreakdown = await _expenses.BreakdownAsync(pFrom, pTo);
        var prevTotal     = prevBreakdown.Sum(b => b.Total);
        var prevMap       = prevBreakdown.ToDictionary(b => b.Category, b => b.Total);

        var enriched = breakdown.Select(b => {
            var hasBudget = budgetMap.TryGetValue(b.Category, out var cap) && cap > 0;
            var pct = hasBudget ? Math.Round((double)b.Total / cap * 1000) / 10 : (double?)null;
            var prev = prevMap.TryGetValue(b.Category, out var p) ? p : (int?)null;
            var diff = prev.HasValue ? b.Total - prev.Value : (int?)null;
            return new EnrichedBreakdown
            {
                Category = b.Category,
                Total    = b.Total,
                Count    = b.Count,
                Budget   = hasBudget ? cap : (int?)null,
                PercentOfBudget = pct,
                Over     = hasBudget && b.Total > cap,
                PreviousTotal   = prev,
                Diff     = diff,
                DiffPercent = prev.HasValue ? PctDiff(b.Total, prev.Value) : (double?)null,
            };
        }).ToList();

        var totalBudget = enriched.Where(e => e.Budget.HasValue).Sum(e => e.Budget!.Value);
        var totalOver   = totalBudget > 0 && total > totalBudget;
        var overCategories = enriched.Where(e => e.Over).Select(e => e.Category).ToList();

        return new SummaryResult
        {
            Period = period,
            From = from,
            To = to,
            Total = total,
            Breakdown = enriched,
            TotalBudget = totalBudget,
            TotalOver = totalOver,
            OverCategories = overCategories,
            Previous = new PreviousPeriod
            {
                Period = PreviousPeriodName(period),
                From = pFrom,
                To = pTo,
                Total = prevTotal,
                Diff = total - prevTotal,
                DiffPercent = PctDiff(total, prevTotal),
            },
        };
    }

    private static double? PctDiff(int current, int prior)
    {
        if (prior == 0) return null;
        return Math.Round(((double)current - prior) / prior * 1000) / 10;
    }

    public static (DateTime from, DateTime to) ResolvePeriod(string period)
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
            case "thismonth":
            default:
            {
                var first = new DateTime(utc.Year, utc.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                return (first, first.AddMonths(1));
            }
        }
    }

    public static (DateTime from, DateTime to) PreviousPeriod(DateTime from, DateTime to, string period)
    {
        var length = to - from;
        return period.ToLowerInvariant() switch
        {
            "lastmonth"  => (from.AddMonths(-1), from),
            "last7days"  => (from.AddDays(-7), from),
            _            => (from.AddMonths(-1), from),
        };
    }

    public static string PreviousPeriodName(string period) => period.ToLowerInvariant() switch
    {
        "lastmonth" => "the month before",
        "last7days" => "the previous 7 days",
        _           => "last month",
    };
}

public class SummaryResult
{
    public string Period { get; set; } = "";
    public DateTime From { get; set; }
    public DateTime To { get; set; }
    public int Total { get; set; }
    public List<EnrichedBreakdown> Breakdown { get; set; } = new();
    public int TotalBudget { get; set; }
    public bool TotalOver { get; set; }
    public List<string> OverCategories { get; set; } = new();
    public PreviousPeriod Previous { get; set; } = new();
}

public class EnrichedBreakdown
{
    public string Category { get; set; } = "";
    public int Total { get; set; }
    public int Count { get; set; }
    public int? Budget { get; set; }
    public double? PercentOfBudget { get; set; }
    public bool Over { get; set; }
    public int? PreviousTotal { get; set; }
    public int? Diff { get; set; }
    public double? DiffPercent { get; set; }
}

public class PreviousPeriod
{
    public string Period { get; set; } = "";
    public DateTime From { get; set; }
    public DateTime To { get; set; }
    public int Total { get; set; }
    public int Diff { get; set; }
    public double? DiffPercent { get; set; }
}