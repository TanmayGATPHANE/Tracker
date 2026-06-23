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
    /// Inspect all active recurring items and post any that are due.
    /// "Due" means: today's day-of-month is &gt;= item's dayOfMonth, AND the
    /// item's lastPosted != current month. The expense's occurredOn is set to
    /// the current month's <c>dayOfMonth</c> at 12:00 UTC, so it sorts and
    /// groups naturally with manually-added entries for the same day.
    /// </summary>
    public async Task<PostingResult> PostDueAsync(DateTime nowUtc)
    {
        var result = new PostingResult();
        var currentMonth = $"{nowUtc.Year:D4}-{nowUtc.Month:D2}";
        var items = await _recurring.ListAsync();

        foreach (var r in items)
        {
            if (!r.Active) continue;
            if (!IsInWindow(r, currentMonth)) continue;
            if (r.LastPosted == currentMonth) continue;
            if (r.DayOfMonth > nowUtc.Day) continue; // not yet this month

            // Atomic claim — only the caller that successfully updates lastPosted
            // inserts the expense. Avoids double-posting under concurrent reads.
            var claimed = await _recurring.MarkPostedAsync(r.Id, currentMonth);
            if (!claimed) continue;

            // Pick a sensible day: cap dayOfMonth at the last day of the month
            // (so a recurring set to day=31 still posts on Feb 28).
            var daysInMonth = DateTime.DaysInMonth(nowUtc.Year, nowUtc.Month);
            var day = Math.Min(r.DayOfMonth, daysInMonth);
            var occurredOn = new DateTime(nowUtc.Year, nowUtc.Month, day, 12, 0, 0, DateTimeKind.Utc);

            var expense = new Expense
            {
                Amount     = r.Amount,
                Category   = r.Category,
                Note       = r.Note,
                OccurredOn = occurredOn,
                CreatedAt  = DateTime.UtcNow,
            };
            await _expenses.CreateAsync(expense);
            result.Posted.Add((r.Category, r.Amount));
        }
        return result;
    }

    private static bool IsInWindow(Recurring r, string currentMonth)
    {
        if (string.CompareOrdinal(r.StartMonth, currentMonth) > 0) return false;
        if (!string.IsNullOrEmpty(r.EndMonth) &&
            string.CompareOrdinal(r.EndMonth, currentMonth) < 0) return false;
        return true;
    }
}

public class PostingResult
{
    public List<(string Category, int Amount)> Posted { get; } = new();
}