using ExpenseApi.Models;
using MongoDB.Driver;

namespace ExpenseApi.Services;

public class ExpenseRepository
{
    private readonly IMongoContext _ctx;

    public ExpenseRepository(IMongoContext ctx) => _ctx = ctx;

    public Task CreateAsync(Expense e) =>
        _ctx.Expenses.InsertOneAsync(e);

    public Task CreateManyAsync(IEnumerable<Expense> expenses) =>
        _ctx.Expenses.InsertManyAsync(expenses);

    /// <summary>
    /// Returns the (amount, category, occurredOn, note) tuples from the given
    /// window — used by the bulk import to skip rows that already exist.
    /// Note: note is included in the match because two Swiggy orders on the
    /// same day are not the same order.
    /// </summary>
    public async Task<HashSet<(int Amount, string Category, DateTime OccurredOn, string Note)>>
        ExistingTuplesAsync(DateTime from, DateTime to)
    {
        var filter = Builders<Expense>.Filter.Gte(x => x.OccurredOn, from)
                   & Builders<Expense>.Filter.Lt(x => x.OccurredOn, to);
        var docs = await _ctx.Expenses.Find(filter)
            .Project(x => new { x.Amount, x.Category, x.OccurredOn, x.Note })
            .ToListAsync();
        var set = new HashSet<(int, string, DateTime, string)>();
        foreach (var d in docs)
            set.Add((d.Amount, d.Category, d.OccurredOn, d.Note ?? ""));
        return set;
    }

    public Task<Expense?> GetAsync(string id) =>
        _ctx.Expenses.Find(x => x.Id == id).FirstOrDefaultAsync()!;

    public Task DeleteAsync(string id) =>
        _ctx.Expenses.DeleteOneAsync(x => x.Id == id);

    public async Task<List<Expense>> ListAsync(DateTime from, DateTime to, int limit)
    {
        var filter = Builders<Expense>.Filter.Gte(x => x.OccurredOn, from)
                   & Builders<Expense>.Filter.Lt(x => x.OccurredOn, to);
        return await _ctx.Expenses.Find(filter)
            .SortByDescending(x => x.OccurredOn)
            .Limit(limit)
            .ToListAsync();
    }

    public async Task<long> CountByCategoryAsync(string category) =>
        await _ctx.Expenses.CountDocumentsAsync(x => x.Category == category);

    /// <summary>
    /// Per-category totals for the window, returned as a list of (category, total, count).
    /// </summary>
    public async Task<List<CategoryBreakdown>> BreakdownAsync(DateTime from, DateTime to)
    {
        var match = Builders<Expense>.Filter.Gte(x => x.OccurredOn, from)
                  & Builders<Expense>.Filter.Lt(x => x.OccurredOn, to);

        var result = await _ctx.Expenses.Aggregate()
            .Match(match)
            .Group(x => x.Category, g => new CategoryBreakdown
            {
                Category = g.Key,
                Total    = g.Sum(e => e.Amount),
                Count    = g.Count()
            })
            .ToListAsync();

        return result;
    }
}

public class CategoryBreakdown
{
    public string Category { get; set; } = "";
    public int    Total    { get; set; }
    public int    Count    { get; set; }
}