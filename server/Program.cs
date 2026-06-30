using System.Text;
using System.Threading.RateLimiting;
using ExpenseApi.Auth;
using ExpenseApi.Models;
using ExpenseApi.Services;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

// Don't let .NET rewrite JWT claim types on inbound — keep `sub` as
// ClaimTypes.NameIdentifier so FindFirstValue works.
System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler.DefaultMapInboundClaims = false;

// --- Config ----------------------------------------------------------------
// Load .env into process environment. On Render, real env vars are already
// set and DotNetEnv won't overwrite them — it only fills in missing keys —
// so the same .env works for local dev without affecting Render.
// Load .env files cumulatively. DotNetEnv only fills keys not already set in the
// process, so real env vars on Render are never overwritten. We prefer the
// repo-root .env (the one you edit) first, then the one next to the built output
// as a fallback. Loading both — instead of stopping at the first found — matters:
// a stale bin/.env can otherwise shadow a freshly-edited root .env (e.g. a newly
// added AUTH_JWT_SECRET would be silently ignored and the server would refuse to start).
foreach (var path in new[] {
    ".env",
    Path.Combine(AppContext.BaseDirectory, ".env")
})
{
    if (File.Exists(path))
    {
        DotNetEnv.Env.Load(path);
    }
}

// Helper: prefer process env (populated by DotNetEnv), fall back to Configuration.
static string ReadEnv(string key, string? fallback = null) =>
    Environment.GetEnvironmentVariable(key) ?? fallback
    ?? throw new InvalidOperationException($"{key} is not set.");

// JWT secret must never silently fall back to a known default in production —
// that would let anyone who reads this repo forge a valid admin token. We only
// allow the bundled dev default when running as Development, and we always
// reject the default and too-short secrets when a real one is provided.
static string ReadJwtSecret()
{
    var secret = Environment.GetEnvironmentVariable("AUTH_JWT_SECRET");
    var isDev  = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development";

    if (string.IsNullOrEmpty(secret))
    {
        if (isDev) return "dev-secret-change-me-in-prod-please";
        throw new InvalidOperationException(
            "AUTH_JWT_SECRET is not set. Set it to a random string of at least 32 bytes.");
    }

    if (secret == "dev-secret-change-me-in-prod-please")
        throw new InvalidOperationException("AUTH_JWT_SECRET must not be the bundled dev default.");

    if (Encoding.UTF8.GetByteCount(secret) < 32)
        throw new InvalidOperationException("AUTH_JWT_SECRET must be at least 32 bytes (256 bits) for HMAC-SHA256.");

    return secret;
}

var mongoUri = ReadEnv("MONGODB_URI");
var dbName   = Environment.GetEnvironmentVariable("MONGODB_DB") ?? "expenses";
var origin   = Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") ?? "http://localhost:5173";
var appPwd   = ReadEnv("ADMIN_PASSWORD");            // shared password
var jwtSecret = ReadJwtSecret();
var jwtIssuer = Environment.GetEnvironmentVariable("AUTH_JWT_ISSUER") ?? "ledger";
var jwtAud    = Environment.GetEnvironmentVariable("AUTH_JWT_AUDIENCE") ?? "ledger-clients";

var builder = WebApplication.CreateBuilder(args);

// --- Services --------------------------------------------------------------
builder.Services.AddSingleton<IMongoContext>(_ => new MongoContext(mongoUri, dbName));
builder.Services.AddSingleton<ExpenseRepository>();
builder.Services.AddSingleton<CategoryRepository>();
builder.Services.AddSingleton<BudgetRepository>();
builder.Services.AddSingleton<RecurringRepository>();
builder.Services.AddSingleton<RecurringPostingService>();
builder.Services.AddSingleton<SummaryService>();
builder.Services.AddSingleton<UserRepository>();
builder.Services.AddSingleton<TokenService>(_ => new TokenService(jwtSecret, jwtIssuer, jwtAud));

builder.Services.AddControllers();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(origin)
    .AllowAnyHeader()
    .AllowAnyMethod()));

// Rate limit the login endpoint — 5 attempts per minute per client IP. This is
// the only unauthenticated brute-force surface (the shared password is the sole
// barrier to all financial data), so throttling it matters more than throttling
// the authed endpoints. The "login" policy is opted-in per-endpoint via
// [EnableRateLimiting("login")] on AuthController.Login.
builder.Services.AddRateLimiter(o =>
{
    o.AddPolicy("login", ctx =>
    {
        // RemoteIpAddress is populated from X-Forwarded-For by UseForwardedHeaders
        // (see pipeline), so behind Render's proxy this is the real client IP, not
        // the proxy's. Clearing KnownProxies trusts any hop — acceptable for a
        // personal app; Render's edge overwrites client-supplied X-Forwarded-For,
        // so spoofing the header to rotate IPs is low risk.
        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window      = TimeSpan.FromMinutes(1),
            QueueLimit  = 0,
        });
    });
    o.OnRejected = async (ctx, token) =>
    {
        ctx.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsync(
            "{\"error\":\"too many login attempts — try again in a minute\"}", token);
    };
});

// --- Pipeline --------------------------------------------------------------
var app = builder.Build();

// Trust Render's forwarded headers so RemoteIpAddress + the rate limiter see the
// real client. Must run before anything that reads Connection.RemoteIpAddress.
var fwdOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
};
fwdOptions.KnownNetworks.Clear();
fwdOptions.KnownProxies.Clear();
app.UseForwardedHeaders(fwdOptions);

app.UseRouting();
app.UseCors();
app.UseRateLimiter();
app.UseMiddleware<JwtAuthMiddleware>();
app.MapControllers();

// --- Startup tasks ---------------------------------------------------------
using (var scope = app.Services.CreateScope())
{
    var users = scope.ServiceProvider.GetRequiredService<UserRepository>();
    await users.EnsureIndexesAsync();

    // Seed the single admin user on first run, and on every run we re-sync the
    // password hash to match ADMIN_PASSWORD. This is convenient for dev: change
    // the env var, restart, the password rotates. Idempotent.
    var existing = (await users.ListAsync()).FirstOrDefault(u => u.IsAdmin);
    if (existing is null)
    {
        await users.CreateAsync(new User {
            Name         = "admin",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(appPwd),
            IsAdmin      = true,
            Active       = true,
        });
    }
    else
    {
        // Re-hash if the env password changed since last boot.
        if (!BCrypt.Net.BCrypt.Verify(appPwd, existing.PasswordHash))
        {
            existing.PasswordHash = BCrypt.Net.BCrypt.HashPassword(appPwd);
            await users.UpdateAsync(existing);
        }
    }

    var categories = scope.ServiceProvider.GetRequiredService<CategoryRepository>();
    await categories.EnsureIndexesAsync();
    await categories.SeedDefaultsAsync();
    var budgets = scope.ServiceProvider.GetRequiredService<BudgetRepository>();
    await budgets.EnsureIndexesAsync();
    var recurring = scope.ServiceProvider.GetRequiredService<RecurringRepository>();
    await recurring.EnsureIndexesAsync();
}

app.Run();

// Exposed for integration tests (WebApplicationFactory<Program>). Top-level
// statements generate an internal Program; this partial declaration makes it
// public so the test project can reference it.
public partial class Program { }