using ExpenseApi.Models;
using ExpenseApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

[ApiController]
[Route("api/recurring")]
public class RecurringController : ControllerBase
{
    private readonly RecurringRepository _repo;
    private readonly CategoryRepository _catRepo;

    public RecurringController(RecurringRepository repo, CategoryRepository catRepo)
    {
        _repo = repo;
        _catRepo = catRepo;
    }

    public record CreateRecurringDto(
        string Category,
        int Amount,
        string? Note,
        int DayOfMonth,
        string StartMonth,
        string? EndMonth);

    [HttpGet]
    public async Task<ActionResult<List<Recurring>>> List()
    {
        // Recurring list changes only when the user adds/toggles/deletes one.
        // 60s browser cache cuts the round trip on Admin page revisits.
        Response.Headers["Cache-Control"] = "private, max-age=60";
        return Ok(await _repo.ListAsync());
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRecurringDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Category))
            return BadRequest(new { error = "category is required" });
        if (dto.Amount <= 0)
            return BadRequest(new { error = "amount must be > 0" });
        if (dto.DayOfMonth < 1 || dto.DayOfMonth > 28)
            return BadRequest(new { error = "dayOfMonth must be 1-28" });
        if (!IsValidYearMonth(dto.StartMonth))
            return BadRequest(new { error = "startMonth must be YYYY-MM" });
        if (!string.IsNullOrEmpty(dto.EndMonth) && !IsValidYearMonth(dto.EndMonth))
            return BadRequest(new { error = "endMonth must be YYYY-MM or null" });
        if (!string.IsNullOrEmpty(dto.EndMonth) &&
            string.CompareOrdinal(dto.EndMonth, dto.StartMonth) < 0)
            return BadRequest(new { error = "endMonth must be on or after startMonth" });

        var cat = await _catRepo.GetByNameAsync(dto.Category.Trim());
        if (cat is null)
            return BadRequest(new { error = $"unknown category: {dto.Category}" });

        var r = new Recurring
        {
            Category   = cat.Name,
            Amount     = dto.Amount,
            Note       = dto.Note?.Trim(),
            DayOfMonth = dto.DayOfMonth,
            StartMonth = dto.StartMonth,
            EndMonth   = string.IsNullOrEmpty(dto.EndMonth) ? null : dto.EndMonth,
            Active     = true,
        };
        await _repo.CreateAsync(r);
        return CreatedAtAction(nameof(Get), new { id = r.Id }, r);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var r = await _repo.GetAsync(id);
        return r is null ? NotFound() : Ok(r);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        await _repo.DeleteAsync(id);
        return NoContent();
    }

    /// <summary>Flip the active flag. On re-activation, anchor LastPosted to the
    /// month before the current one so backfill only posts the current month
    /// onward — not a replay of every month since StartMonth. (PostDueAsync now
    /// backfills missed months, so leaving LastPosted null would dump history.)</summary>
    [HttpPatch("{id}/toggle")]
    public async Task<IActionResult> Toggle(string id)
    {
        var r = await _repo.GetAsync(id);
        if (r is null) return NotFound();
        r.Active = !r.Active;
        if (r.Active)
        {
            var prev = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddDays(-1);
            r.LastPosted = $"{prev.Year:D4}-{prev.Month:D2}";
        }
        await _repo.UpdateAsync(r);
        return Ok(r);
    }

    private static bool IsValidYearMonth(string ym) =>
        !string.IsNullOrWhiteSpace(ym) && ym.Length == 7 &&
        int.TryParse(ym.AsSpan(0, 4), out var y) && y is >= 1970 and <= 2999 &&
        ym[4] == '-' &&
        int.TryParse(ym.AsSpan(5, 2), out var m) && m is >= 1 and <= 12;
}