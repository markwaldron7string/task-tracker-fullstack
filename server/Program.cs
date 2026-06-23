using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var connectionString = ResolveTasksConnectionString(builder.Configuration);
EnsureSqliteDirectoryExists(connectionString);
builder.Services.AddDbContext<TaskDbContext>(options => options.UseSqlite(connectionString));

builder.Services.AddCors(options =>
{
    var allowedOrigins = builder.Configuration
        .GetSection("Cors:AllowedOrigins")
        .Get<string[]>() ?? ["http://localhost:4200"];

    options.AddPolicy("AllowConfiguredOrigins", policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TaskDbContext>();
    await db.Database.MigrateAsync();
}

app.UseCors("AllowConfiguredOrigins");

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/tasks", async (HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");
    return Results.Ok(await db.Tasks.Where(t => t.UserId == userId).OrderBy(t => t.Id).ToListAsync());
});

app.MapGet("/api/tasks/{id}", async (int id, HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");
    var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
    return task is null ? Results.NotFound() : Results.Ok(task);
});

app.MapPost("/api/tasks", async (CreateTaskRequest request, HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");

    var title = request.Title?.Trim();
    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest("Title is required.");

    var newTask = new TaskItem { UserId = userId, Title = title, Done = false };
    db.Tasks.Add(newTask);
    await db.SaveChangesAsync();
    return Results.Created($"/api/tasks/{newTask.Id}", newTask);
});

app.MapPut("/api/tasks/{id}", async (int id, UpdateTaskRequest request, HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");

    var title = request.Title?.Trim();
    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest("Title is required.");

    var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
    if (task is null) return Results.NotFound();

    task.Title = title;
    task.Done = request.Done;
    await db.SaveChangesAsync();
    return Results.Ok(task);
});

app.MapDelete("/api/tasks/{id}", async (int id, HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");

    var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
    if (task is null) return Results.NotFound();

    db.Tasks.Remove(task);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapDelete("/api/tasks", async (HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");

    var userTasks = await db.Tasks.Where(t => t.UserId == userId).ToListAsync();
    db.Tasks.RemoveRange(userTasks);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.Run();

// ----- Data types -----

static string ResolveTasksConnectionString(IConfiguration configuration)
{
    var configuredConnectionString = configuration.GetConnectionString("Tasks");
    if (IsRunningOnAzureAppService() && UsesLocalSqlitePath(configuredConnectionString))
    {
        return GetAzureSqliteConnectionString();
    }

    return string.IsNullOrWhiteSpace(configuredConnectionString)
        ? "Data Source=tasks.db"
        : configuredConnectionString;
}

static bool IsRunningOnAzureAppService()
{
    return !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME"));
}

static bool UsesLocalSqlitePath(string? connectionString)
{
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return true;
    }

    var dataSource = new SqliteConnectionStringBuilder(connectionString).DataSource;
    return string.IsNullOrWhiteSpace(dataSource) || !Path.IsPathRooted(dataSource);
}

static string GetAzureSqliteConnectionString()
{
    var homeDirectory = Environment.GetEnvironmentVariable("HOME") ?? @"D:\home";
    var databasePath = Path.Combine(homeDirectory, "data", "tasks.db");
    return $"Data Source={databasePath}";
}

static void EnsureSqliteDirectoryExists(string connectionString)
{
    var dataSource = new SqliteConnectionStringBuilder(connectionString).DataSource;
    if (string.IsNullOrWhiteSpace(dataSource) ||
        string.Equals(dataSource, ":memory:", StringComparison.OrdinalIgnoreCase))
    {
        return;
    }

    var directory = Path.GetDirectoryName(Path.GetFullPath(dataSource));
    if (!string.IsNullOrWhiteSpace(directory))
    {
        Directory.CreateDirectory(directory);
    }
}

class TaskItem
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Title { get; set; } = "";
    public bool Done { get; set; }
}

record CreateTaskRequest(string? Title);
record UpdateTaskRequest(string? Title, bool Done);

// ----- Database -----

class TaskDbContext : DbContext
{
    public TaskDbContext(DbContextOptions<TaskDbContext> options) : base(options) { }

    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) { }
}

public partial class Program { }
