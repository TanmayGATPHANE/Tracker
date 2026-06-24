using ExpenseApi.Models;
using ExpenseApi.Services;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace ExpenseApi.Controllers;

[ApiController]
[Route("api/categories")]
public class CategoriesController : ControllerBase
{
    private readonly CategoryRepository _categories;
    private readonly ExpenseRepository _expenses;

    public CategoriesController(CategoryRepository categories, ExpenseRepository expenses)
    {
        _categories = categories;
        _expenses = expenses;
    }

    /// <summary>
    /// Public — used by Add and History pages to populate the dropdown.
    /// Includes usage count per category.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List()
    {
        // 60s browser cache: categories change rarely (a new one per month,
        // max), and the client also keeps an in-memory cache. The browser
        // revalidation after 60s is negligible traffic.
        Response.Headers["Cache-Control"] = "private, max-age=60";

        var cats = await _categories.ListAsync();
        var result = new List<object>(cats.Count);
        foreach (var c in cats)
        {
            var count = await _expenses.CountByCategoryAsync(c.Name);
            result.Add(new { id = c.Id, name = c.Name, count });
        }
        return Ok(result);
    }

    public record CreateCategoryDto(string Name);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCategoryDto dto)
    {
        var name = (dto.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { error = "name is required" });

        var existing = await _categories.GetByNameAsync(name);
        if (existing is not null)
            return Conflict(new { error = $"category '{name}' already exists" });

        var cat = new Category { Name = name };
        try
        {
            await _categories.CreateAsync(cat);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            return Conflict(new { error = $"category '{name}' already exists" });
        }
        return CreatedAtAction(nameof(GetById), new { id = cat.Id }, cat);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var c = await _categories.GetAsync(id);
        return c is null ? NotFound() : Ok(c);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var c = await _categories.GetAsync(id);
        if (c is null) return NotFound();

        var inUse = await _expenses.CountByCategoryAsync(c.Name);
        if (inUse > 0)
            return Conflict(new { error = $"category is used by {inUse} expense(s)", count = inUse });

        await _categories.DeleteAsync(id);
        return NoContent();
    }
}