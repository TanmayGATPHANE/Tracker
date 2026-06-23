using ExpenseApi.Models;
using MongoDB.Driver;

namespace ExpenseApi.Services;

public class CategoryRepository
{
    private static readonly string[] Defaults =
    {
        "Food", "Transport", "Rent", "Utilities",
        "Shopping", "Health", "Entertainment", "Other"
    };

    private readonly IMongoContext _ctx;

    public CategoryRepository(IMongoContext ctx) => _ctx = ctx;

    /// <summary>
    /// Inserts default categories on startup if the collection is empty.
    /// Idempotent — safe to run on every boot.
    /// </summary>
    public async Task SeedDefaultsAsync()
    {
        var count = await _ctx.Categories.CountDocumentsAsync(FilterDefinition<Category>.Empty);
        if (count > 0) return;

        var docs = Defaults.Select(name => new Category { Name = name }).ToList();
        await _ctx.Categories.InsertManyAsync(docs);
    }

    public async Task<List<Category>> ListAsync() =>
        await _ctx.Categories.Find(FilterDefinition<Category>.Empty)
            .SortBy(x => x.Name)
            .ToListAsync();

    public async Task<Category?> GetAsync(string id) =>
        await _ctx.Categories.Find(x => x.Id == id).FirstOrDefaultAsync();

    public async Task<Category?> GetByNameAsync(string name) =>
        await _ctx.Categories.Find(x => x.Name == name).FirstOrDefaultAsync();

    public async Task CreateAsync(Category c)
    {
        c.Name = c.Name.Trim();
        await _ctx.Categories.InsertOneAsync(c);
    }

    /// <summary>
    /// Returns the existing category with this name, or creates and returns a new one.
    /// Used by the bulk import endpoint to auto-create unknown categories.
    /// Single-user app: GetByNameAsync + InsertOneAsync is safe in practice.
    /// </summary>
    public async Task<Category> EnsureAsync(string name)
    {
        var trimmed = name.Trim();
        var existing = await GetByNameAsync(trimmed);
        if (existing != null) return existing;

        var fresh = new Category { Name = trimmed };
        await _ctx.Categories.InsertOneAsync(fresh);
        return fresh;
    }

    public Task DeleteAsync(string id) =>
        _ctx.Categories.DeleteOneAsync(x => x.Id == id);
}