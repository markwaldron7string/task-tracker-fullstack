using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var connectionString = builder.Configuration.GetConnectionString("Tasks") ?? "Data Source=tasks.db";
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

app.MapGet("/api/tasks", async (TaskDbContext db) =>
    await db.Tasks.ToListAsync());

app.MapGet("/api/tasks/{id}", async (int id, TaskDbContext db) =>
{
    var task = await db.Tasks.FindAsync(id);
    return task is null ? Results.NotFound() : Results.Ok(task);
});

app.MapPost("/api/tasks", async (CreateTaskRequest request, TaskDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Title))
        return Results.BadRequest("Title is required.");

    var newTask = new TaskItem { Title = request.Title, Done = false };
    db.Tasks.Add(newTask);
    await db.SaveChangesAsync();
    return Results.Created($"/api/tasks/{newTask.Id}", newTask);
});

app.MapPut("/api/tasks/{id}", async (int id, UpdateTaskRequest request, TaskDbContext db) =>
{
    var task = await db.Tasks.FindAsync(id);
    if (task is null) return Results.NotFound();

    task.Title = request.Title;
    task.Done = request.Done;
    await db.SaveChangesAsync();
    return Results.Ok(task);
});

app.MapDelete("/api/tasks/{id}", async (int id, TaskDbContext db) =>
{
    var task = await db.Tasks.FindAsync(id);
    if (task is null) return Results.NotFound();

    db.Tasks.Remove(task);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapDelete("/api/tasks", async (TaskDbContext db) =>
{
    var allTasks = await db.Tasks.ToListAsync();
    db.Tasks.RemoveRange(allTasks);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.Run();

// ----- Data types -----

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
    public string Title { get; set; } = "";
    public bool Done { get; set; }
}

record CreateTaskRequest(string Title);
record UpdateTaskRequest(string Title, bool Done);

// ----- Database -----

class TaskDbContext : DbContext
{
    public TaskDbContext(DbContextOptions<TaskDbContext> options) : base(options) { }

    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TaskItem>().HasData(
            new TaskItem { Id = 1, Title = "Buy groceries", Done = false },
            new TaskItem { Id = 2, Title = "Walk the dog", Done = false },
            new TaskItem { Id = 3, Title = "Learn C#", Done = false }
        );
    }
}
