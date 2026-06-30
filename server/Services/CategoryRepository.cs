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

    /// <summary>Ensure a unique index on Name so duplicates can't be created
    /// concurrently (the DuplicateKey catch in the controller relies on this).</summary>
    public async Task EnsureIndexesAsync()
    {
        var keys = Builders<Category>.IndexKeys.Ascending(c => c.Name);
        await _ctx.Categories.Indexes.CreateOneAsync(
            new CreateIndexModel<Category>(keys, new CreateIndexOptions { Unique = true, Name = "uq_name" }));
    }

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
    /// The unique index backs this up: if two concurrent callers race past the
    /// GetByName check, the loser's insert throws DuplicateKey and we re-fetch.
    /// </summary>
    public async Task<Category> EnsureAsync(string name)
    {
        var trimmed = name.Trim();
        var existing = await GetByNameAsync(trimmed);
        if (existing != null) return existing;

        var fresh = new Category { Name = trimmed };
        try
        {
            await _ctx.Categories.InsertOneAsync(fresh);
            return fresh;
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            // A concurrent caller won the race — return theirs.
            return (await GetByNameAsync(trimmed))!;
        }
    }

    public Task DeleteAsync(string id) =>
        _ctx.Categories.DeleteOneAsync(x => x.Id == id);
}