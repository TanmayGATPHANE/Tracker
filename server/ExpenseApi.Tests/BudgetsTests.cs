using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace ExpenseApi.Tests;

public class BudgetsTests : ApiTestBase
{
    public BudgetsTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Upsert_then_list()
    {
        var client = await AuthedAsync();
        var ym = CurrentYearMonth;
        var resp = await client.PutAsJsonAsync($"/api/budgets/Food?yearMonth={ym}", new { amount = 5000 });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal(5000, (await JsonAsync(resp)).GetProperty("amount").GetInt32());

        var list = await JsonAsync(await client.GetAsync($"/api/budgets?yearMonth={ym}"));
        var food = Assert.Single(list.EnumerateArray(), b => b.GetProperty("category").GetString() == "Food");
        Assert.Equal(5000, food.GetProperty("amount").GetInt32());
    }

    [Fact]
    public async Task Upsert_unknown_category_returns_400()
    {
        var client = await AuthedAsync();
        var resp = await client.PutAsJsonAsync($"/api/budgets/Nonexistent?yearMonth={CurrentYearMonth}", new { amount = 100 });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Upsert_bad_yearMonth_returns_400()
    {
        var client = await AuthedAsync();
        var resp = await client.PutAsJsonAsync("/api/budgets/Food?yearMonth=not-a-month", new { amount = 100 });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Delete_budget()
    {
        var client = await AuthedAsync();
        var ym = CurrentYearMonth;
        await client.PutAsJsonAsync($"/api/budgets/Food?yearMonth={ym}", new { amount = 5000 });

        var del = await client.DeleteAsync($"/api/budgets/Food?yearMonth={ym}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = (await JsonAsync(await client.GetAsync($"/api/budgets?yearMonth={ym}"))).EnumerateArray().ToList();
        Assert.DoesNotContain(list, b => b.GetProperty("category").GetString() == "Food");
    }

    [Fact]
    public async Task List_invalid_yearMonth_returns_400()
    {
        var client = await AuthedAsync();
        var resp = await client.GetAsync("/api/budgets?yearMonth=bad");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}