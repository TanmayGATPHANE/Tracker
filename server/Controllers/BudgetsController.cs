using ExpenseApi.Models;
using ExpenseApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

[ApiController]
[Route("api/budgets")]
public class BudgetsController : ControllerBase
{
    private readonly BudgetRepository _repo;
    private readonly CategoryRepository _catRepo;

    public BudgetsController(BudgetRepository repo, CategoryRepository catRepo)
    {
        _repo = repo;
        _catRepo = catRepo;
    }

    /// <summary>List budgets for a month. Defaults to current month.</summary>
    [HttpGet]
    public async Task<ActionResult<List<Budget>>> List([FromQuery] string? yearMonth)
    {
        var ym = string.IsNullOrWhiteSpace(yearMonth) ? CurrentYearMonth() : yearMonth;
        if (!IsValidYearMonth(ym)) return BadRequest("yearMonth must be YYYY-MM");
        return Ok(await _repo.ListAsync(ym));
    }

    /// <summary>Upsert a budget for one (category, month). Amount must be &gt;= 0.</summary>
    [HttpPut("{category}")]
    public async Task<ActionResult<Budget>> Upsert(string category, [FromQuery] string yearMonth, [FromBody] UpsertRequest body)
    {
        if (string.IsNullOrWhiteSpace(category)) return BadRequest("category required");
        if (!IsValidYearMonth(yearMonth)) return BadRequest("yearMonth must be YYYY-MM");
        if (body is null || body.Amount < 0) return BadRequest("amount must be >= 0");

        var exists = await _catRepo.GetByNameAsync(category);
        if (exists is null) return BadRequest($"category '{category}' does not exist");

        await _repo.UpsertAsync(category, yearMonth, body.Amount);
        var saved = await _repo.GetAsync(category, yearMonth);
        return Ok(saved);
    }

    /// <summary>Remove a budget for one (category, month).</summary>
    [HttpDelete("{category}")]
    public async Task<IActionResult> Delete(string category, [FromQuery] string yearMonth)
    {
        if (string.IsNullOrWhiteSpace(category)) return BadRequest("category required");
        if (!IsValidYearMonth(yearMonth)) return BadRequest("yearMonth must be YYYY-MM");
        await _repo.DeleteAsync(category, yearMonth);
        return NoContent();
    }

    public class UpsertRequest
    {
        public int Amount { get; set; }
    }

    private static string CurrentYearMonth() =>
        DateTime.UtcNow.ToString("yyyy-MM");

    private static bool IsValidYearMonth(string ym) =>
        !string.IsNullOrWhiteSpace(ym) && ym.Length == 7 &&
        int.TryParse(ym.AsSpan(0, 4), out var y) && y is >= 1970 and <= 2999 &&
        ym[4] == '-' &&
        int.TryParse(ym.AsSpan(5, 2), out var m) && m is >= 1 and <= 12;
}