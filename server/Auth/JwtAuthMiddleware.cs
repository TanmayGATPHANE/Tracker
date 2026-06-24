using ExpenseApi.Services;

namespace ExpenseApi.Auth;

/// <summary>
/// Gates every /api/* route behind a valid JWT in the Authorization header.
/// Public paths: /api/auth/* (login). The login endpoint itself is what creates
/// the token, so it obviously can't require one.
/// </summary>
public class JwtAuthMiddleware
{
    private readonly RequestDelegate _next;

    public JwtAuthMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext ctx, TokenService tokens)
    {
        var path = ctx.Request.Path.Value ?? "";

        // Public — login only. Everything else under /api/auth/* (me, change-password)
        // still needs a token. /api/version is also public so the frontend can
        // read it before the user logs in.
        if (path.Equals("/api/auth/login", StringComparison.OrdinalIgnoreCase) ||
            path.Equals("/api/version", StringComparison.OrdinalIgnoreCase))
        {
            await _next(ctx);
            return;
        }

        // Anything else under /api/* needs a token
        if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
        {
            await _next(ctx);
            return;
        }

        var auth = ctx.Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(auth) || !auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            await Reject(ctx, "missing bearer token");
            return;
        }

        var principal = tokens.Validate(auth.Substring("Bearer ".Length).Trim());
        if (principal is null)
        {
            await Reject(ctx, "invalid or expired token");
            return;
        }

        ctx.User = principal;
        await _next(ctx);
    }

    private static async Task Reject(HttpContext ctx, string msg)
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        ctx.Response.Headers.WWWAuthenticate = "Bearer";
        await ctx.Response.WriteAsync($"{{\"error\":\"{msg}\"}}");
    }
}