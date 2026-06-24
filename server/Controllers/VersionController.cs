using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

/// <summary>
/// Public, unauthenticated endpoint that reports what version of the API is
/// running. The frontend reads this to display in its footer so the user can
/// tell which backend version the deployed build is hitting.
/// </summary>
[ApiController]
[Route("api/version")]
public class VersionController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IWebHostEnvironment _env;

    public VersionController(IConfiguration config, IWebHostEnvironment env)
    {
        _config = config;
        _env = env;
    }

    [HttpGet]
    public IActionResult Get()
    {
        // AppVersion is set in appsettings.json. Bump it manually when you ship.
        var version = _config["AppVersion"] ?? "0.0.0";

        // SHA is written by the Dockerfile at build time (ARG GIT_SHA → file).
        // In dev, fall back to reading .git/HEAD if the file isn't there.
        var sha = ReadSha();

        return Ok(new { version, sha });
    }

    private string ReadSha()
    {
        // The .git folder lives at the repo root, one level above the server
        // project. In Docker, /app/GIT_SHA is written by the Dockerfile.
        var dockerPath = Path.Combine(_env.ContentRootPath, "GIT_SHA");
        if (System.IO.File.Exists(dockerPath))
            return System.IO.File.ReadAllText(dockerPath).Trim();

        var gitHead = Path.Combine(_env.ContentRootPath, "..", ".git", "HEAD");
        if (!System.IO.File.Exists(gitHead)) return "";

        var head = System.IO.File.ReadAllText(gitHead).Trim();
        if (!head.StartsWith("ref: ")) return head;

        var refPath = Path.Combine(_env.ContentRootPath, "..", ".git", head.Substring(5));
        if (!System.IO.File.Exists(refPath)) return "";
        return System.IO.File.ReadAllText(refPath).Trim();
    }
}