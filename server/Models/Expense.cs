using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace ExpenseApi.Models;

public class Expense
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    [BsonElement("amount")]
    public int Amount { get; set; }

    [BsonElement("category")]
    public string Category { get; set; } = "";

    [BsonElement("note")]
    public string? Note { get; set; }

    [BsonElement("occurredOn")]
    public DateTime OccurredOn { get; set; } = DateTime.UtcNow;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}