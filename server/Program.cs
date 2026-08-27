using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;
using TaskTracker;
using TaskTracker.Coach;

BindToPlatformPort();
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.Configure<CoachOptions>(builder.Configuration.GetSection("Coach"));
builder.Services.AddHttpClient<OpenAiCoachProvider>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(90);
});
builder.Services.AddSingleton<StubCoachProvider>();
builder.Services.AddSingleton<CoachService>();

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
    var tasks = await db.Tasks
        .Where(t => t.UserId == userId)
        .OrderBy(t => t.SortOrder)
        .ThenBy(t => t.Id)
        .ToListAsync();
    return Results.Ok(tasks.Select(ToTaskResponse));
});

app.MapGet("/api/tasks/{id}", async (int id, HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");
    var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
    return task is null ? Results.NotFound() : Results.Ok(ToTaskResponse(task));
});

app.MapPost("/api/tasks", async (CreateTaskRequest request, HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");

    var title = request.Title?.Trim();
    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest("Title is required.");

    var maxSortOrder = await db.Tasks
        .Where(t => t.UserId == userId)
        .Select(t => (int?)t.SortOrder)
        .MaxAsync() ?? 0;

    var newTask = new TaskItem
    {
        UserId = userId,
        Title = title,
        Done = false,
        SortOrder = maxSortOrder + 10,
        Priority = NormalizePriority(request.Priority),
        Due = NormalizeDue(request.Due),
        EstimateMinutes = request.EstimateMinutes,
        Project = NormalizeProject(request.Project),
        Recurrence = NormalizeRecurrence(request.Recurrence),
        ChecklistJson = ChecklistHelper.Serialize(ChecklistHelper.Normalize(request.Checklist)),
    };
    db.Tasks.Add(newTask);
    await db.SaveChangesAsync();
    return Results.Created($"/api/tasks/{newTask.Id}", ToTaskResponse(newTask));
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
    task.Priority = NormalizePriority(request.Priority);
    task.Due = NormalizeDue(request.Due);
    task.EstimateMinutes = request.EstimateMinutes;
    task.Project = NormalizeProject(request.Project);
    task.Recurrence = NormalizeRecurrence(request.Recurrence);
    if (request.Checklist is not null)
        task.ChecklistJson = ChecklistHelper.Serialize(ChecklistHelper.Normalize(request.Checklist));
    await db.SaveChangesAsync();
    return Results.Ok(ToTaskResponse(task));
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

app.MapPatch("/api/tasks/reorder", async (ReorderTasksRequest request, HttpContext ctx, TaskDbContext db) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");
    if (request.Tasks is null || request.Tasks.Count == 0)
        return Results.BadRequest("Tasks array is required.");

    var requestedIds = request.Tasks.Select(item => item.Id).ToHashSet();
    var tasks = await db.Tasks
        .Where(task => task.UserId == userId && requestedIds.Contains(task.Id))
        .ToListAsync();

    if (tasks.Count != requestedIds.Count) return Results.NotFound();

    foreach (var item in request.Tasks)
    {
        var task = tasks.First(existing => existing.Id == item.Id);
        task.SortOrder = item.SortOrder;
    }

    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapPost("/api/coach/chat", async (CoachChatRequest request, HttpContext ctx, CoachService coach, TaskDbContext db, CancellationToken cancellationToken) =>
{
    var userId = ctx.Request.Headers["X-User-ID"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(userId)) return Results.BadRequest("X-User-ID header is required.");

    if (request.Snapshot is null)
        return Results.BadRequest("Snapshot is required.");

    var tasks = await db.Tasks
        .Where(task => task.UserId == userId && !task.Done)
        .OrderBy(task => task.Id)
        .Select(task => new CoachTaskItem(
            task.Id,
            task.Title,
            task.Due,
            task.Priority,
            task.EstimateMinutes))
        .ToListAsync(cancellationToken);

    var reply = await coach.ChatAsync(
        request.Question,
        request.Snapshot,
        tasks,
        request.History,
        request.CurrentSchedule,
        request.ReviseSchedule,
        cancellationToken);
    return Results.Ok(reply);
});

app.Run();

// ----- Data types -----

static void BindToPlatformPort()
{
    var port = Environment.GetEnvironmentVariable("PORT");
    if (string.IsNullOrWhiteSpace(port))
        return;

    // Microsoft container images set ASPNETCORE_HTTP_PORTS=8080. Render health-
    // checks $PORT (usually 10000), so override the image default before Kestrel
    // is configured. Leave PORT unset locally so tests keep their random ports.
    Environment.SetEnvironmentVariable("ASPNETCORE_HTTP_PORTS", port);
    Environment.SetEnvironmentVariable("ASPNETCORE_URLS", $"http://0.0.0.0:{port}");
}

static string ResolveTasksConnectionString(IConfiguration configuration)
{
    var configuredConnectionString = configuration.GetConnectionString("Tasks");
    if (UsesLocalSqlitePath(configuredConnectionString) &&
        (IsRunningOnAzureAppService() || IsRunningOnRender()))
    {
        return GetHostedSqliteConnectionString();
    }

    return string.IsNullOrWhiteSpace(configuredConnectionString)
        ? "Data Source=tasks.db"
        : configuredConnectionString;
}

static bool IsRunningOnAzureAppService()
{
    return !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME"));
}

static bool IsRunningOnRender()
{
    return string.Equals(Environment.GetEnvironmentVariable("RENDER"), "true", StringComparison.OrdinalIgnoreCase);
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

static string GetHostedSqliteConnectionString()
{
    var dataDirectory = Environment.GetEnvironmentVariable("DATA_DIRECTORY");
    if (string.IsNullOrWhiteSpace(dataDirectory))
    {
        dataDirectory = IsRunningOnAzureAppService()
            ? Path.Combine(Environment.GetEnvironmentVariable("HOME") ?? @"D:\home", "data")
            : "/tmp/data";
    }

    var databasePath = Path.Combine(dataDirectory, "tasks.db");
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

static string NormalizePriority(string? priority)
{
    return priority?.Trim().ToLowerInvariant() switch
    {
        "low" => "low",
        "medium" => "medium",
        "high" => "high",
        _ => "none"
    };
}

static string? NormalizeDue(string? due)
{
    var trimmed = due?.Trim();
    return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
}

static string? NormalizeProject(string? project)
{
    var trimmed = project?.Trim().ToLowerInvariant();
    return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
}

static string? NormalizeRecurrence(string? recurrence)
{
    return recurrence?.Trim().ToLowerInvariant() switch
    {
        "daily" => "daily",
        "weekly" => "weekly",
        "weekdays" => "weekdays",
        "weekends" => "weekends",
        "monthly" => "monthly",
        "custom" => "custom",
        _ => null
    };
}

static TaskResponse ToTaskResponse(TaskItem task) => new(
    task.Id,
    task.Title,
    task.Done,
    task.SortOrder,
    task.Priority,
    task.Due,
    task.EstimateMinutes,
    task.Project,
    task.Recurrence,
    ChecklistHelper.Deserialize(task.ChecklistJson));

class TaskItem
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Title { get; set; } = "";
    public bool Done { get; set; }
    public int SortOrder { get; set; }
    public string Priority { get; set; } = "none";
    public string? Due { get; set; }
    public int? EstimateMinutes { get; set; }
    public string? Project { get; set; }
    public string? Recurrence { get; set; }
    public string? ChecklistJson { get; set; }
}

record TaskResponse(
    int Id,
    string Title,
    bool Done,
    int SortOrder,
    string Priority,
    string? Due,
    int? EstimateMinutes,
    string? Project,
    string? Recurrence,
    List<ChecklistItem> Checklist);

record ReorderTasksRequest(IReadOnlyList<ReorderTaskItem> Tasks);

record ReorderTaskItem(int Id, int SortOrder);

record CreateTaskRequest(
    string? Title,
    string? Due = null,
    string? Priority = null,
    int? EstimateMinutes = null,
    string? Project = null,
    string? Recurrence = null,
    List<ChecklistItem>? Checklist = null);

record UpdateTaskRequest(
    string? Title,
    bool Done,
    string? Due = null,
    string? Priority = null,
    int? EstimateMinutes = null,
    string? Project = null,
    string? Recurrence = null,
    List<ChecklistItem>? Checklist = null);

// ----- Database -----

class TaskDbContext : DbContext
{
    public TaskDbContext(DbContextOptions<TaskDbContext> options) : base(options) { }

    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) { }
}

public partial class Program { }
