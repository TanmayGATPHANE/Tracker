using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace ExpenseApi.Models;

public class User
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    /// <summary>Display name shown in the UI. Not unique.</summary>
    [BsonElement("name")]
    public string Name { get; set; } = "";

    /// <summary>BCrypt hash of the shared password. Empty means the default password was used.</summary>
    [BsonElement("passwordHash")]
    public string PasswordHash { get; set; } = "";

    /// <summary>Soft toggle. Inactive users can't log in.</summary>
    [BsonElement("active")]
    public bool Active { get; set; } = true;

    /// <summary>True for the bootstrap admin. Currently unused beyond display.</summary>
    [BsonElement("isAdmin")]
    public bool IsAdmin { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("lastLoginAt")]
    public DateTime? LastLoginAt { get; set; }
}