using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace ExpenseApi.Tests;

public class DashboardTests : ApiTestBase
{
    public DashboardTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Get_returns_summary_entries_budgets_categories_recurring()
    {
        var client = await AuthedAsync();
        // Seed a little data so the payload isn't all empty.
        await client.PostAsJsonAsync("/api/expenses", new { amount = 100, category = "Food", note = "x", occurredOn = (DateTime?)null });

        var resp = await client.GetAsync("/api/dashboard?period=thisMonth");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await JsonAsync(resp);
        Assert.True(body.TryGetProperty("summary", out _));
        Assert.True(body.TryGetProperty("entries", out _));
        Assert.True(body.TryGetProperty("budgets", out _));
        Assert.True(body.TryGetProperty("categories", out _));
        Assert.True(body.TryGetProperty("recurring", out _));

        // Categories is a non-empty array (defaults are seeded).
        Assert.NotEmpty(body.GetProperty("categories").EnumerateArray());
    }

    [Fact]
    public async Task Get_with_unknown_period_defaults_to_this_month_range()
    {
        var client = await AuthedAsync();
        var resp = await client.GetAsync("/api/dashboard?period=garbage");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await JsonAsync(resp);
        var summary = body.GetProperty("summary");
        var firstOfMonth = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
        Assert.Equal(firstOfMonth, summary.GetProperty("from").GetDateTime());
    }
}