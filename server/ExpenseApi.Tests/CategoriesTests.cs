using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace ExpenseApi.Tests;

public class CategoriesTests : ApiTestBase
{
    public CategoriesTests(CustomWebApplicationFactory factory) : base(factory) { }

    private static readonly string[] DefaultNames =
        { "Food", "Transport", "Rent", "Utilities", "Shopping", "Health", "Entertainment", "Other" };

    [Fact]
    public async Task List_returns_seeded_defaults()
    {
        var client = await AuthedAsync();
        var resp = await client.GetAsync("/api/categories");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var names = (await JsonAsync(resp)).EnumerateArray().Select(c => c.GetProperty("name").GetString()!).ToList();
        foreach (var expected in DefaultNames)
            Assert.Contains(expected, names);
    }

    [Fact]
    public async Task Create_then_listed()
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/categories", new { name = "Hobbies" });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        Assert.Equal("Hobbies", (await JsonAsync(resp)).GetProperty("name").GetString());

        var names = (await JsonAsync(await client.GetAsync("/api/categories")))
            .EnumerateArray().Select(c => c.GetProperty("name").GetString()!).ToList();
        Assert.Contains("Hobbies", names);
    }

    [Fact]
    public async Task Create_duplicate_returns_409()
    {
        var client = await AuthedAsync();
        var resp = await client.PostAsJsonAsync("/api/categories", new { name = "Food" });
        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task Delete_category_in_use_returns_409()
    {
        var client = await AuthedAsync();
        // Put an expense against "Food" so it's in use.
        await client.PostAsJsonAsync("/api/expenses", new { amount = 50, category = "Food", note = (string?)null, occurredOn = (DateTime?)null });

        var foodId = (await JsonAsync(await client.GetAsync("/api/categories")))
            .EnumerateArray().First(c => c.GetProperty("name").GetString() == "Food").GetProperty("id").GetString();

        var resp = await client.DeleteAsync($"/api/categories/{foodId}");
        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task Delete_unused_category_works()
    {
        var client = await AuthedAsync();
        var created = await JsonAsync(await client.PostAsJsonAsync("/api/categories", new { name = "Hobbies" }));
        var id = created.GetProperty("id").GetString();

        var del = await client.DeleteAsync($"/api/categories/{id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var names = (await JsonAsync(await client.GetAsync("/api/categories")))
            .EnumerateArray().Select(c => c.GetProperty("name").GetString()!).ToList();
        Assert.DoesNotContain("Hobbies", names);
    }
}