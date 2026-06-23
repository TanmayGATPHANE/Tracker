using ExpenseApi.Models;
using MongoDB.Driver;

namespace ExpenseApi.Services;

public class RecurringRepository
{
    private readonly IMongoContext _ctx;

    public RecurringRepository(IMongoContext ctx) => _ctx = ctx;

    public async Task EnsureIndexesAsync()
    {
        var keys = Builders<Recurring>.IndexKeys.Ascending(r => r.LastPosted);
        await _ctx.Recurring.Indexes.CreateOneAsync(
            new CreateIndexModel<Recurring>(keys, new CreateIndexOptions { Name = "ix_lastPosted" }));
    }

    public async Task<List<Recurring>> ListAsync() =>
        await _ctx.Recurring.Find(Builders<Recurring>.Filter.Empty).ToListAsync();

    public async Task<Recurring?> GetAsync(string id) =>
        await _ctx.Recurring.Find(r => r.Id == id).FirstOrDefaultAsync();

    public async Task CreateAsync(Recurring r)
    {
        r.CreatedAt = DateTime.UtcNow;
        r.UpdatedAt = r.CreatedAt;
        await _ctx.Recurring.InsertOneAsync(r);
    }

    public async Task UpdateAsync(Recurring r)
    {
        r.UpdatedAt = DateTime.UtcNow;
        await _ctx.Recurring.ReplaceOneAsync(x => x.Id == r.Id, r);
    }

    public async Task DeleteAsync(string id) =>
        await _ctx.Recurring.DeleteOneAsync(r => r.Id == id);

    /// <summary>
    /// Atomically mark a recurring as posted for a given month. Returns true if THIS
    /// call performed the mark (so caller knows to insert the expense). Returns false
    /// if another concurrent caller already marked it.
    /// </summary>
    public async Task<bool> MarkPostedAsync(string id, string yearMonth)
    {
        var filter = Builders<Recurring>.Filter.And(
            Builders<Recurring>.Filter.Eq(r => r.Id, id),
            Builders<Recurring>.Filter.Ne(r => r.LastPosted, yearMonth)
        );
        var update = Builders<Recurring>.Update
            .Set(r => r.LastPosted, yearMonth)
            .Set(r => r.UpdatedAt, DateTime.UtcNow);
        var result = await _ctx.Recurring.UpdateOneAsync(filter, update);
        return result.ModifiedCount == 1;
    }
}