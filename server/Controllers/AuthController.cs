using System.Security.Claims;
using ExpenseApi.Models;
using ExpenseApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserRepository _users;
    private readonly TokenService _tokens;

    public AuthController(UserRepository users, TokenService tokens)
    {
        _users = users;
        _tokens = tokens;
    }

    public record LoginDto(string Password);
    public record ChangePasswordDto(string CurrentPassword, string NewPassword);

    /// <summary>
    /// Login with the shared password. Returns a JWT valid for 30 days.
    /// The "user" is implicit — there's only one account, identified by the password.
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        if (string.IsNullOrEmpty(dto?.Password))
            return BadRequest(new { error = "password is required" });

        // Find the single active user. (We seed exactly one at startup.)
        var user = (await _users.ListAsync()).FirstOrDefault(u => u.Active);
        if (user is null)
            return StatusCode(500, new { error = "no active user account; restart the server" });

        if (!BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            return Unauthorized(new { error = "wrong password" });

        user.LastLoginAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);

        return Ok(new {
            token = _tokens.Issue(user),
            user = new { id = user.Id, name = user.Name, isAdmin = user.IsAdmin },
        });
    }

    [HttpGet("me")]
    public IActionResult Me()
    {
        var id   = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var name = User.FindFirstValue(ClaimTypes.Name);
        var adm  = User.FindFirstValue("isAdmin") == "1";
        return Ok(new { id, name, isAdmin = adm });
    }

    /// <summary>
    /// Rotate the password. The user must know the current one. On success, the
    /// current token remains valid (until expiry). Subsequent logins require the
    /// new password.
    /// </summary>
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        if (string.IsNullOrEmpty(dto?.CurrentPassword) || string.IsNullOrEmpty(dto?.NewPassword))
            return BadRequest(new { error = "both fields required" });
        if (dto.NewPassword.Length < 4)
            return BadRequest(new { error = "new password must be at least 4 characters" });
        if (dto.NewPassword == dto.CurrentPassword)
            return BadRequest(new { error = "new password must differ from current" });

        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = await _users.GetAsync(id ?? "");
        if (user is null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
            return Unauthorized(new { error = "current password is wrong" });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        await _users.UpdateAsync(user);
        return Ok(new { ok = true });
    }
}