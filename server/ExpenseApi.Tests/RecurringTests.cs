using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ExpenseApi.Models;
using ExpenseApi.Services;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using Xunit;

namespace ExpenseApi.Tests;

public class RecurringTests : ApiTestBase
{
    public RecurringTests(CustomWebApplicationFactory factory) : base(factory) { }

    private static object NewRecurring(string category = "Rent", int amount = 12000, int day = 5, string? startMonth = null, string? endMonth = null) =>
        new { category, amount, note = "rent", dayOfMonth = day, startMonth = startMonth ?? CurrentYearMonth, endMonth };

    [Fact]
    public async Task Create_then_list()
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/recurring", NewRecurring());
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        Assert.Equal("Rent", (await JsonAsync(resp)).GetProperty("category").GetString());

        var list = (await JsonAsync(await client.GetAsync("/api/recurring"))).EnumerateArray().ToList();
        Assert.Contains(list, r => r.GetProperty("category").GetString() == "Rent");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(29)]
    [InlineData(31)]
    public async Task Create_bad_dayOfMonth_returns_400(int day)
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/recurring", NewRecurring(day: day));
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Create_unknown_category_returns_400()
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/recurring", NewRecurring(category: "Nope"));
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Toggle_flips_active()
    {
        var client = await AuthedAsync();
        var id = (await JsonAsync(await client.PostAsJsonAsync("/api/recurring", NewRecurring()))).GetProperty("id").GetString();

        var off = await JsonAsync(await client.PatchAsync($"/api/recurring/{id}/toggle", null));
        Assert.False(off.GetProperty("active").GetBoolean());

        var on = await JsonAsync(await client.PatchAsync($"/api/recurring/{id}/toggle", null));
        Assert.True(on.GetProperty("active").GetBoolean());
    }

    [Fact]
    public async Task Delete_recurring()
    {
        var client = await AuthedAsync();
        var id = (await JsonAsync(await client.PostAsJsonAsync("/api/recurring", NewRecurring()))).GetProperty("id").GetString();

        var del = await client.DeleteAsync($"/api/recurring/{id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = (await JsonAsync(await client.GetAsync("/api/recurring"))).EnumerateArray().ToList();
        Assert.DoesNotContain(list, r => r.GetProperty("id").GetString() == id);
    }

    /// <summary>
    /// The backfill fix: a recurring created with a start month in the past and
    /// no lastPosted must generate entries for every missed month up to the
    /// current one on the next read (PostDueAsync), not just the current month.
    /// </summary>
    [Fact]
    public async Task Posting_backfills_missed_months()
    {
        var client = await AuthedAsync();
        var now = DateTime.UtcNow;
        var start = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-2);
        var startMonth = $"{start.Year:D4}-{start.Month:D2}";
        var currentMonth = $"{now.Year:D4}-{now.Month:D2}";
        var midMonth = $"{start.AddMonths(1).Year:D4}-{start.AddMonths(1).Month:D2}";

        // dayOfMonth = 1 is always <= any day of the month, so the current month
        // is always considered due — making the expected count deterministic (3).
        var id = (await JsonAsync(await client.PostAsJsonAsync("/api/recurring",
            NewRecurring(category: "Rent", amount: 1000, day: 1, startMonth: startMonth)))).GetProperty("id").GetString();

        // Any read of expenses/summary/dashboard triggers lazy posting.
        await client.GetAsync("/api/dashboard?period=thisMonth");

        // Assert directly in Mongo — the API has no period that covers month -2.
        var ctx = Factory.MongoContext;
        var rentEntries = await ctx.Expenses.Find(e => e.Category == "Rent").ToListAsync();
        var postedMonths = rentEntries.Select(e => $"{e.OccurredOn.Year:D4}-{e.OccurredOn.Month:D2}").OrderBy(m => m).ToList();

        Assert.Equal(3, rentEntries.Count);
        Assert.Equal(new[] { startMonth, midMonth, currentMonth }, postedMonths);
        Assert.Equal(1000, rentEntries.Sum(e => e.Amount));

        // The recurring's LastPosted should now be the current month.
        var recurring = await ctx.Recurring.Find(r => r.Id == id).FirstOrDefaultAsync();
        Assert.Equal(currentMonth, recurring?.LastPosted);
    }
}