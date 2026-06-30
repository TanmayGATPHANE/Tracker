using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.RateLimiting;
using ExpenseApi.Models;
using ExpenseApi.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MongoDB.Driver;
using Mongo2Go;

namespace ExpenseApi.Tests;

/// <summary>
/// Boots the whole API in-process via WebApplicationFactory<Program> against an
/// isolated MongoDB, and seeds a known admin user + default categories. The
/// database is wiped and re-seeded before every test (see <see cref="ResetAsync"/>)
/// so the suite is fully repeatable — run it as often as you like to diagnose.
///
/// MongoDB source, in priority order:
///   1. TEST_MONGODB_URI env var — use a local or Atlas instance (a unique test
///      database is created/dropped, never your real one).
///   2. Otherwise — Mongo2Go embedded mongod (zero config; downloads binaries
///      on first run and caches them).
/// </summary>
public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    public const string AdminPassword = "test-admin-password";

    private readonly bool _permissiveRateLimit;
    private MongoDbRunner? _mongoRunner;
    private readonly string _connectionUri;
    private readonly string _dbName = "expenses_test_" + Guid.NewGuid().ToString("N");

    // Default ctor: permissive login limiter so the suite never self-throttles.
    public CustomWebApplicationFactory() : this(permissiveRateLimit: true) { }

    protected CustomWebApplicationFactory(bool permissiveRateLimit)
    {
        _permissiveRateLimit = permissiveRateLimit;

        var external = Environment.GetEnvironmentVariable("TEST_MONGODB_URI");
        if (!string.IsNullOrEmpty(external))
        {
            _connectionUri = external;
            try { new MongoClient(external).DropDatabase(_dbName); } catch { /* ignore — db may not exist yet */ }
        }
        else
        {
            _mongoRunner = MongoDbRunner.Start();
            _connectionUri = _mongoRunner.ConnectionString;
        }

        // These are read by Program.cs at the very top (before the host builder),
        // so they must be set BEFORE the first CreateClient() builds the host.
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
        Environment.SetEnvironmentVariable("ADMIN_PASSWORD", AdminPassword);
        Environment.SetEnvironmentVariable("AUTH_JWT_SECRET", "test-secret-at-least-32-bytes-long-aaaaaaaa");
        Environment.SetEnvironmentVariable("MONGODB_URI", _connectionUri);
        Environment.SetEnvironmentVariable("MONGODB_DB", _dbName);
        Environment.SetEnvironmentVariable("ALLOWED_ORIGIN", "http://localhost");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureTestServices(services =>
        {
            // Point IMongoContext at the isolated test DB regardless of env timing.
            var existing = services.SingleOrDefault(d => d.ServiceType == typeof(IMongoContext));
            if (existing != null) services.Remove(existing);
            services.AddSingleton<IMongoContext>(_ => new MongoContext(_connectionUri, _dbName));

            if (_permissiveRateLimit)
            {
                // Override the strict 5/min "login" policy (same policy name wins) so the
                // test suite — which logs in many times — doesn't trip its own limiter.
                // The dedicated RateLimitTests class uses a non-permissive factory.
                services.AddRateLimiter(o => o.AddPolicy("login", _ =>
                    RateLimitPartition.GetFixedWindowLimiter("test", _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 100_000,
                        Window      = TimeSpan.FromMinutes(1),
                        QueueLimit  = 0,
                    })));
            }
        });
    }

    /// <summary>Wipe every collection and re-seed the admin user + default
    /// categories. Call before each test for isolation. Indexes created during
    /// the initial host startup persist across the wipe (DeleteMany keeps them).</summary>
    public async Task ResetAsync()
    {
        CreateClient(); // ensure the host is built so Services is populated
        using var scope = Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<IMongoContext>();

        await ctx.Expenses.DeleteManyAsync(FilterDefinition<Expense>.Empty);
        await ctx.Categories.DeleteManyAsync(FilterDefinition<Category>.Empty);
        await ctx.Budgets.DeleteManyAsync(FilterDefinition<Budget>.Empty);
        await ctx.Recurring.DeleteManyAsync(FilterDefinition<Recurring>.Empty);
        await ctx.Users.DeleteManyAsync(FilterDefinition<User>.Empty);

        var cats = scope.ServiceProvider.GetRequiredService<CategoryRepository>();
        await cats.SeedDefaultsAsync();

        var users = scope.ServiceProvider.GetRequiredService<UserRepository>();
        await users.CreateAsync(new User
        {
            Name         = "admin",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(AdminPassword),
            IsAdmin      = true,
            Active       = true,
        });
    }

    /// <summary>A client that has already logged in and carries the JWT bearer
    /// token on every request.</summary>
    public async Task<HttpClient> CreateAuthedClientAsync()
    {
        var client = CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { password = AdminPassword });
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<JsonDocument>() ?? throw new InvalidOperationException("login returned no body");
        var token = body.RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    /// <summary>Direct access to the test Mongo context for assertions that the
    /// HTTP API can't express (e.g. entries in a month no API period covers).</summary>
    public IMongoContext MongoContext
    {
        get
        {
            CreateClient();
            using var scope = Services.CreateScope();
            return scope.ServiceProvider.GetRequiredService<IMongoContext>();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _mongoRunner?.Dispose();
        base.Dispose(disposing);
    }
}

/// <summary>Factory variant that keeps the app's real 5/min login limiter, for
/// the rate-limit test. Uses its own embedded Mongo instance.</summary>
public class StrictRateLimitFactory : CustomWebApplicationFactory
{
    public StrictRateLimitFactory() : base(permissiveRateLimit: false) { }
}