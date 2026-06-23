using ExpenseApi.Auth;
using ExpenseApi.Models;
using ExpenseApi.Services;

// Don't let .NET rewrite JWT claim types on inbound — keep `sub` as
// ClaimTypes.NameIdentifier so FindFirstValue works.
System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler.DefaultMapInboundClaims = false;

// --- Config ----------------------------------------------------------------
// Load .env into process environment. On Render, real env vars are already
// set and DotNetEnv won't overwrite them — it only fills in missing keys —
// so the same .env works for local dev without affecting Render.
foreach (var path in new[] {
    Path.Combine(AppContext.BaseDirectory, ".env"),
    ".env"
})
{
    if (File.Exists(path))
    {
        DotNetEnv.Env.Load(path);
        break;
    }
}

// Helper: prefer process env (populated by DotNetEnv), fall back to Configuration.
static string ReadEnv(string key, string? fallback = null) =>
    Environment.GetEnvironmentVariable(key) ?? fallback
    ?? throw new InvalidOperationException($"{key} is not set.");

var mongoUri = ReadEnv("MONGODB_URI");
var dbName   = Environment.GetEnvironmentVariable("MONGODB_DB") ?? "expenses";
var origin   = Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") ?? "http://localhost:5173";
var appPwd   = ReadEnv("ADMIN_PASSWORD");            // shared password
var jwtSecret = Environment.GetEnvironmentVariable("AUTH_JWT_SECRET") ?? "dev-secret-change-me-in-prod-please";
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
builder.Services.AddSingleton<UserRepository>();
builder.Services.AddSingleton<TokenService>(_ => new TokenService(jwtSecret, jwtIssuer, jwtAud));

builder.Services.AddControllers();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(origin)
    .AllowAnyHeader()
    .AllowAnyMethod()));

// --- Pipeline --------------------------------------------------------------
var app = builder.Build();

app.UseCors();
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
    await categories.SeedDefaultsAsync();
    var budgets = scope.ServiceProvider.GetRequiredService<BudgetRepository>();
    await budgets.EnsureIndexesAsync();
    var recurring = scope.ServiceProvider.GetRequiredService<RecurringRepository>();
    await recurring.EnsureIndexesAsync();
}

app.Run();