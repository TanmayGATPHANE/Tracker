using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace ExpenseApi.Models;

public class Budget
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    /// <summary>Category name. Matches Category.Name exactly.</summary>
    [BsonElement("category")]
    public string Category { get; set; } = "";

    /// <summary>Monthly cap in rupees (integer).</summary>
    [BsonElement("amount")]
    public int Amount { get; set; }

    /// <summary>Partition key, "YYYY-MM" e.g. "2026-06".</summary>
    [BsonElement("yearMonth")]
    public string YearMonth { get; set; } = "";

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}