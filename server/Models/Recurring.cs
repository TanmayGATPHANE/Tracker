using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace ExpenseApi.Models;

public class Recurring
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    /// <summary>Category name. Matches Category.Name exactly.</summary>
    [BsonElement("category")]
    public string Category { get; set; } = "";

    /// <summary>Amount in rupees (integer).</summary>
    [BsonElement("amount")]
    public int Amount { get; set; }

    /// <summary>Optional note attached to the posted expense.</summary>
    [BsonElement("note")]
    public string? Note { get; set; }

    /// <summary>Day of month the entry is posted (1-28, capped to avoid Feb edge case).</summary>
    [BsonElement("dayOfMonth")]
    public int DayOfMonth { get; set; } = 1;

    /// <summary>First month the recurring rule applies. "YYYY-MM".</summary>
    [BsonElement("startMonth")]
    public string StartMonth { get; set; } = "";

    /// <summary>Last month the rule applies. "YYYY-MM" or null for ongoing.</summary>
    [BsonElement("endMonth")]
    public string? EndMonth { get; set; }

    /// <summary>Soft toggle. Inactive items are skipped during posting.</summary>
    [BsonElement("active")]
    public bool Active { get; set; } = true;

    /// <summary>Last "YYYY-MM" for which a real expense was generated. Null = never posted.</summary>
    [BsonElement("lastPosted")]
    public string? LastPosted { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}