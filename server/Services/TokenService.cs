using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ExpenseApi.Models;
using Microsoft.IdentityModel.Tokens;

namespace ExpenseApi.Services;

/// <summary>
/// Issues and validates JWTs. One shared secret from env (AUTH_JWT_SECRET).
/// For a single-server personal app this is fine. For a real production app
/// you'd want a longer key from a secrets manager — but that's a deploy-time
/// concern, not a code-time one.
/// </summary>
public class TokenService
{
    private readonly string _secret;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly TimeSpan _lifetime = TimeSpan.FromDays(30);

    public TokenService(string secret, string issuer, string audience)
    {
        _secret   = secret;
        _issuer   = issuer;
        _audience = audience;
    }

    public string Issue(User u)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: new[] {
                new Claim(ClaimTypes.NameIdentifier, u.Id),
                new Claim(ClaimTypes.Name, u.Name),
                new Claim("isAdmin", u.IsAdmin ? "1" : "0"),
            },
            expires: DateTime.UtcNow.Add(_lifetime),
            signingCredentials: creds
        );
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public ClaimsPrincipal? Validate(string token)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var handler = new JwtSecurityTokenHandler();
        try
        {
            return handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer           = true,
                ValidIssuer              = _issuer,
                ValidateAudience         = true,
                ValidAudience            = _audience,
                ValidateLifetime         = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey         = key,
                ClockSkew                = TimeSpan.FromMinutes(1),
            }, out _);
        }
        catch
        {
            return null;
        }
    }
}