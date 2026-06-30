using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace ExpenseApi.Tests;

/// <summary>Uses a separate factory that keeps the real 5/min login limiter, so
/// the rate-limit behavior can be tested without the rest of the suite's
/// permissive override. Runs in its own collection so it gets a fresh limiter.</summary>
[CollectionDefinition("strict")]
public class StrictCollection : ICollectionFixture<StrictRateLimitFactory> { }

[Collection("strict")]
public class RateLimitTests : IAsyncLifetime
{
    private readonly StrictRateLimitFactory _factory;
    public RateLimitTests(StrictRateLimitFactory factory) => _factory = factory;

    public async Task InitializeAsync() => await _factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Sixth_login_within_one_minute_returns_429()
    {
        var client = _factory.CreateClient();

        // 5 wrong-password attempts are allowed (each returns 401 but consumes a permit).
        for (int i = 0; i < 5; i++)
        {
            var resp = await client.PostAsJsonAsync("/api/auth/login", new { password = "wrong" });
            Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
        }

        // The 6th within the same 1-minute window is throttled.
        var throttled = await client.PostAsJsonAsync("/api/auth/login", new { password = "wrong" });
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }
}