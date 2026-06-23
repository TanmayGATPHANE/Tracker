using ExpenseApi.Models;
using MongoDB.Driver;

namespace ExpenseApi.Services;

public class BudgetRepository
{
    private readonly IMongoContext _ctx;

    public BudgetRepository(IMongoContext ctx) => _ctx = ctx;

    /// <summary>Ensure the (category, yearMonth) unique index exists.</summary>
    public async Task EnsureIndexesAsync()
    {
        var keys = Builders<Budget>.IndexKeys
            .Ascending(b => b.Category)
            .Ascending(b => b.YearMonth);
        var model = new CreateIndexModel<Budget>(keys,
            new CreateIndexOptions { Unique = true, Name = "uq_category_yearMonth" });
        await _ctx.Budgets.Indexes.CreateOneAsync(model);
    }

    public async Task<List<Budget>> ListAsync(string yearMonth) =>
        await _ctx.Budgets.Find(b => b.YearMonth == yearMonth).ToListAsync();

    public async Task<Budget?> GetAsync(string category, string yearMonth) =>
        await _ctx.Budgets.Find(b => b.Category == category && b.YearMonth == yearMonth).FirstOrDefaultAsync();

    public async Task UpsertAsync(string category, string yearMonth, int amount)
    {
        var filter = Builders<Budget>.Filter.Where(b => b.Category == category && b.YearMonth == yearMonth);
        var now = DateTime.UtcNow;
        var update = Builders<Budget>.Update
            .Set(b => b.Amount, amount)
            .Set(b => b.UpdatedAt, now)
            .SetOnInsert(b => b.Category, category)
            .SetOnInsert(b => b.YearMonth, yearMonth)
            .SetOnInsert(b => b.CreatedAt, now);
        await _ctx.Budgets.UpdateOneAsync(filter, update, new UpdateOptions { IsUpsert = true });
    }

    public async Task DeleteAsync(string category, string yearMonth)
    {
        await _ctx.Budgets.DeleteOneAsync(b => b.Category == category && b.YearMonth == yearMonth);
    }

    /// <summary>
    /// Bulk lookup keyed by category for the given month. Returns a dictionary so
    /// the breakdown can be enriched in one pass without N+1 queries.
    /// </summary>
    public async Task<Dictionary<string, int>> MapForMonthAsync(string yearMonth)
    {
        var docs = await ListAsync(yearMonth);
        return docs.ToDictionary(b => b.Category, b => b.Amount);
    }
}