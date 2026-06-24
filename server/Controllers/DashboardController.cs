using ExpenseApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

/// <summary>
/// Single endpoint that returns everything the History and Admin pages need
/// to render. Replaces 4-5 separate fetches with one round trip. Cuts the
/// cross-Atlantic latency cost on page load by ~75%.
///
/// The shape is a plain concatenation of the existing endpoints — no new
/// data, just fewer requests.
/// </summary>
[ApiController]
[Route("api/dashboard")]
public class DashboardController : ControllerBase
{
    private readonly SummaryService _summary;
    private readonly ExpenseRepository _expenseRepo;
    private readonly BudgetRepository _budgets;
    private readonly CategoryRepository _categories;
    private readonly RecurringRepository _recurring;

    public DashboardController(
        SummaryService summary,
        ExpenseRepository expenseRepo,
        BudgetRepository budgets,
        CategoryRepository categories,
        RecurringRepository recurring)
    {
        _summary    = summary;
        _expenseRepo = expenseRepo;
        _budgets    = budgets;
        _categories = categories;
        _recurring  = recurring;
    }

    private static string CurrentYearMonth()
    {
        var d = DateTime.UtcNow;
        return $"{d.Year:D4}-{d.Month:D2}";
    }

    /// <summary>
    /// Returns summary + recent entries + budgets + categories + recurring in
    /// one response. Period is one of 'thisMonth' | 'lastMonth' | 'last7Days'.
    /// Cuts the cross-Atlantic page-load cost by ~75% versus fetching each
    /// endpoint separately.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string period = "thisMonth")
    {
        // Compute the entry window from the same period the summary uses.
        var (from, to) = SummaryService.ResolvePeriod(period);

        // Fan out in parallel — most of these hit different collections, so
        // they overlap on the network rather than serializing.
        var summaryTask    = _summary.BuildAsync(period);
        var entriesTask    = _expenseRepo.ListAsync(from, to, 30);
        var ym             = period.ToLowerInvariant() switch
        {
            "lastmonth" => $"{DateTime.UtcNow.AddMonths(-1).Year:D4}-{DateTime.UtcNow.AddMonths(-1).Month:D2}",
            _           => CurrentYearMonth(),
        };
        var budgetsTask    = _budgets.MapForMonthAsync(ym);
        var categoriesTask = _categories.ListAsync();
        var recurringTask  = _recurring.ListAsync();

        await Task.WhenAll(summaryTask, entriesTask, budgetsTask, categoriesTask, recurringTask);

        return Ok(new
        {
            period,
            summary    = summaryTask.Result,
            entries    = entriesTask.Result,
            budgets    = budgetsTask.Result.Select(b => new { category = b.Key, amount = b.Value }),
            categories = categoriesTask.Result,
            recurring  = recurringTask.Result,
        });
    }
}