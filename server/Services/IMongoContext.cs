using MongoDB.Driver;
using ExpenseApi.Models;

namespace ExpenseApi.Services;

public interface IMongoContext
{
    IMongoCollection<Expense> Expenses { get; }
    IMongoCollection<Category> Categories { get; }
    IMongoCollection<Budget> Budgets { get; }
    IMongoCollection<Recurring> Recurring { get; }
    IMongoCollection<User> Users { get; }
}

public class MongoContext : IMongoContext
{
    private readonly IMongoDatabase _db;

    public MongoContext(string connectionUri, string dbName)
    {
        var settings = MongoClientSettings.FromConnectionString(connectionUri);
        settings.ServerSelectionTimeout = TimeSpan.FromSeconds(10);
        var client = new MongoClient(settings);
        _db = client.GetDatabase(dbName);
    }

    public IMongoCollection<Expense> Expenses =>
        _db.GetCollection<Expense>("expenses");

    public IMongoCollection<Category> Categories =>
        _db.GetCollection<Category>("categories");

    public IMongoCollection<Budget> Budgets =>
        _db.GetCollection<Budget>("budgets");

    public IMongoCollection<Recurring> Recurring =>
        _db.GetCollection<Recurring>("recurring");

    public IMongoCollection<User> Users =>
        _db.GetCollection<User>("users");
}