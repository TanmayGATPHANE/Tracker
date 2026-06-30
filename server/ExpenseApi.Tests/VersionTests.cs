using System.Net;
using System.Text.Json;
using Xunit;

namespace ExpenseApi.Tests;

public class VersionTests : ApiTestBase
{
    public VersionTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Version_is_public_and_returns_version_and_sha()
    {
        // No auth header — the version endpoint must be reachable pre-login.
        var client = Factory.CreateClient();
        var resp = await client.GetAsync("/api/version");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await JsonAsync(resp);
        Assert.False(string.IsNullOrEmpty(body.GetProperty("version").GetString()));
        // sha may be empty in test/dev where .git isn't adjacent to ContentRoot; it just must be a string.
        Assert.True(body.TryGetProperty("sha", out _));
    }
}