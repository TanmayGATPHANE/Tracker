using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace ExpenseApi.Tests;

public class AuthTests : ApiTestBase
{
    public AuthTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Login_with_correct_password_returns_token_and_user()
    {
        var client = Factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { password = CustomWebApplicationFactory.AdminPassword });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await JsonAsync(resp);
        Assert.False(string.IsNullOrEmpty(body.GetProperty("token").GetString()));
        var user = body.GetProperty("user");
        Assert.Equal("admin", user.GetProperty("name").GetString());
        Assert.True(user.GetProperty("isAdmin").GetBoolean());
    }

    [Fact]
    public async Task Login_with_wrong_password_returns_401()
    {
        var client = Factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { password = "definitely-wrong" });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
        var body = await JsonAsync(resp);
        Assert.False(string.IsNullOrEmpty(body.GetProperty("error").GetString()));
    }

    [Fact]
    public async Task Login_with_missing_password_returns_400()
    {
        var client = Factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { password = "" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Me_without_token_returns_401()
    {
        var client = Factory.CreateClient();
        var resp = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Me_with_token_returns_user()
    {
        var client = await AuthedAsync();
        var resp = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await JsonAsync(resp);
        Assert.Equal("admin", body.GetProperty("name").GetString());
        Assert.True(body.GetProperty("isAdmin").GetBoolean());
    }

    [Fact]
    public async Task ChangePassword_preauth_with_correct_current_then_new_works()
    {
        // change-password is intentionally reachable before login (the login page
        // exposes it). Proof of knowledge of the current password is the auth.
        var client = Factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = CustomWebApplicationFactory.AdminPassword, newPassword = "new-password-99" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        // New password now works...
        var loginNew = await client.PostAsJsonAsync("/api/auth/login", new { password = "new-password-99" });
        Assert.Equal(HttpStatusCode.OK, loginNew.StatusCode);

        // ...and the old one no longer does.
        var loginOld = await client.PostAsJsonAsync("/api/auth/login", new { password = CustomWebApplicationFactory.AdminPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, loginOld.StatusCode);
    }

    [Fact]
    public async Task ChangePassword_with_wrong_current_returns_401()
    {
        var client = Factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = "wrong", newPassword = "new-password-99" });
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Theory]
    [InlineData("abc")]            // too short (< 8)
    [InlineData("1234567")]        // 7 chars
    public async Task ChangePassword_with_short_new_returns_400(string newPwd)
    {
        var client = Factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = CustomWebApplicationFactory.AdminPassword, newPassword = newPwd });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task ChangePassword_with_new_equal_to_current_returns_400()
    {
        var client = Factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = CustomWebApplicationFactory.AdminPassword, newPassword = CustomWebApplicationFactory.AdminPassword });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}