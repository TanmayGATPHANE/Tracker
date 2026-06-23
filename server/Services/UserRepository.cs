using ExpenseApi.Models;
using MongoDB.Driver;

namespace ExpenseApi.Services;

public class UserRepository
{
    private readonly IMongoContext _ctx;

    public UserRepository(IMongoContext ctx) => _ctx = ctx;

    public async Task EnsureIndexesAsync()
    {
        var keys = Builders<User>.IndexKeys.Ascending(u => u.Name);
        await _ctx.Users.Indexes.CreateOneAsync(
            new CreateIndexModel<User>(keys, new CreateIndexOptions { Name = "ix_name" }));
    }

    public async Task<List<User>> ListAsync() =>
        await _ctx.Users.Find(Builders<User>.Filter.Empty).ToListAsync();

    public async Task<User?> GetAsync(string id) =>
        await _ctx.Users.Find(u => u.Id == id).FirstOrDefaultAsync();

    public async Task<User?> GetByNameAsync(string name) =>
        await _ctx.Users.Find(u => u.Name == name).FirstOrDefaultAsync();

    public async Task CreateAsync(User u)
    {
        u.CreatedAt = DateTime.UtcNow;
        await _ctx.Users.InsertOneAsync(u);
    }

    public async Task UpdateAsync(User u) =>
        await _ctx.Users.ReplaceOneAsync(x => x.Id == u.Id, u);

    public async Task DeleteAsync(string id) =>
        await _ctx.Users.DeleteOneAsync(u => u.Id == id);
}