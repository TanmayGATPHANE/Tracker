using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace ExpenseApi.Tests;

/// <summary>Shared factory across all API test classes — one embedded Mongo for
/// the whole run, reset before each test.</summary>
[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<CustomWebApplicationFactory> { }

/// <summary>Base class for API tests. Resets the DB to a known state before every
/// test so order doesn't matter and the suite is repeatable.</summary>
[Collection("api")]
public abstract class ApiTestBase : IAsyncLifetime
{
    protected CustomWebApplicationFactory Factory { get; }

    protected ApiTestBase(CustomWebApplicationFactory factory) => Factory = factory;

    public async Task InitializeAsync() => await Factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    /// <summary>Read the response body as JSON. Throws if the body is empty.</summary>
    protected static Task<JsonElement> JsonAsync(HttpResponseMessage r) =>
        r.Content.ReadFromJsonAsync<JsonElement>();

    /// <summary>An HttpClient already authenticated with the admin JWT.</summary>
    protected Task<HttpClient> AuthedAsync() => Factory.CreateAuthedClientAsync();

    /// <summary>Current year-month as "YYYY-MM" for budget/recurring tests.</summary>
    protected static string CurrentYearMonth => DateTime.UtcNow.ToString("yyyy-MM");
}