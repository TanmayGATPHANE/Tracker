using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace ExpenseApi.Tests;

public class ExpensesTests : ApiTestBase
{
    public ExpensesTests(CustomWebApplicationFactory factory) : base(factory) { }

    private static readonly object FoodExpense = new { amount = 100, category = "Food", note = "lunch", occurredOn = (DateTime?)null };

    [Fact]
    public async Task Create_returns_201_and_persists()
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/expenses", FoodExpense);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var body = await JsonAsync(resp);
        var id = body.GetProperty("id").GetString();
        Assert.False(string.IsNullOrEmpty(id));
        Assert.Equal(100, body.GetProperty("amount").GetInt32());
        Assert.Equal("Food", body.GetProperty("category").GetString());

        // Fetch it back by id.
        var get = await client.GetAsync($"/api/expenses/{id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        var fetched = await JsonAsync(get);
        Assert.Equal("lunch", fetched.GetProperty("note").GetString());
    }

    [Fact]
    public async Task Create_with_unknown_category_returns_400()
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/expenses", new { amount = 50, category = "Nonexistent", note = (string?)null, occurredOn = (DateTime?)null });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task Create_with_nonpositive_amount_returns_400(int amount)
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/expenses", new { amount, category = "Food", note = (string?)null, occurredOn = (DateTime?)null });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task List_returns_expenses_for_period()
    {
        var client = await AuthedAsync();
        await client.PostAsJsonAsync("/api/expenses", new { amount = 110, category = "Food", note = "a", occurredOn = (DateTime?)null });
        await client.PostAsJsonAsync("/api/expenses", new { amount = 220, category = "Transport", note = "b", occurredOn = (DateTime?)null });

        var resp = await client.GetAsync("/api/expenses?period=thisMonth&limit=50");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var arr = (await JsonAsync(resp)).EnumerateArray().ToList();
        Assert.True(arr.Count >= 2);
        Assert.Contains(arr, e => e.GetProperty("category").GetString() == "Food" && e.GetProperty("amount").GetInt32() == 110);
    }

    [Fact]
    public async Task GetById_unknown_returns_404()
    {
        var client = await AuthedAsync();
        var resp = await client.GetAsync("/api/expenses/605f1b3e0000000000000000");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Delete_removes_expense()
    {
        var client = await AuthedAsync();
        var created = await client.PostAsJsonAsync("/api/expenses", FoodExpense);
        var id = (await JsonAsync(created)).GetProperty("id").GetString();

        var del = await client.DeleteAsync($"/api/expenses/{id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var get = await client.GetAsync($"/api/expenses/{id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
    }

    [Fact]
    public async Task Summary_returns_breakdown_and_total()
    {
        var client = await AuthedAsync();
        await client.PostAsJsonAsync("/api/expenses", new { amount = 300, category = "Food", note = "x", occurredOn = (DateTime?)null });
        await client.PostAsJsonAsync("/api/expenses", new { amount = 200, category = "Food", note = "y", occurredOn = (DateTime?)null });

        var resp = await client.GetAsync("/api/expenses/summary?period=thisMonth");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await JsonAsync(resp);
        Assert.Equal(500, body.GetProperty("total").GetInt32());

        var breakdown = body.GetProperty("breakdown").EnumerateArray().ToList();
        var food = Assert.Single(breakdown, b => b.GetProperty("category").GetString() == "Food");
        Assert.Equal(500, food.GetProperty("total").GetInt32());
        Assert.Equal(2, food.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Import_creates_rows_and_auto_creates_categories()
    {
        var client = await AuthedAsync();
        var date = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var resp = await client.PostAsJsonAsync("/api/expenses/import",
            new { rows = new[]
            {
                new { amount = 200, category = "ImportedCat", date, note = "one" },
                new { amount = 150, category = "Food", date, note = "two" },
            }});

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await JsonAsync(resp);
        Assert.Equal(2, body.GetProperty("imported").GetInt32());

        // ImportedCat was auto-created.
        var cats = await JsonAsync(await client.GetAsync("/api/categories"));
        Assert.Contains(cats.EnumerateArray(), c => c.GetProperty("name").GetString() == "ImportedCat");
    }

    [Fact]
    public async Task Import_dedups_identical_rows()
    {
        var client = await AuthedAsync();
        var date = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var row = new { amount = 250, category = "Food", date, note = "dup" };

        var first = await JsonAsync(await client.PostAsJsonAsync("/api/expenses/import", new { rows = new[] { row } }));
        Assert.Equal(1, first.GetProperty("imported").GetInt32());

        // Re-posting the identical row skips it (idempotency).
        var second = await JsonAsync(await client.PostAsJsonAsync("/api/expenses/import", new { rows = new[] { row } }));
        Assert.Equal(0, second.GetProperty("imported").GetInt32());
        Assert.Equal(1, second.GetProperty("skipped").GetInt32());
    }

    [Fact]
    public async Task Import_rejects_non_iso_dates_with_a_row_error()
    {
        var client = await AuthedAsync();
        // "15/01/2026" is not YYYY-MM-DD — the strict parser must flag it.
        var resp = await client.PostAsJsonAsync("/api/expenses/import",
            new { rows = new[] { new { amount = 10, category = "Food", date = "15/01/2026", note = "" } } });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode); // partial success: row-level error
        var body = await JsonAsync(resp);
        Assert.Equal(0, body.GetProperty("imported").GetInt32());
        var errors = body.GetProperty("errors").EnumerateArray().ToList();
        Assert.Single(errors);
        Assert.Contains("date", errors[0].GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Import_empty_rows_returns_400()
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/expenses/import", new { rows = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}