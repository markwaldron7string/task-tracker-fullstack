using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace TaskTracker.Api.Tests;

public class TaskApiTests : IClassFixture<TaskApiFactory>
{
    private readonly HttpClient client;

    public TaskApiTests(TaskApiFactory factory)
    {
        client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-User-ID", Guid.NewGuid().ToString());
    }

    [Fact]
    public async Task Health_returns_ok()
    {
        var response = await client.GetAsync("/health");

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("ok", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Get_tasks_returns_empty_list_for_new_user()
    {
        var tasks = await client.GetFromJsonAsync<JsonElement[]>("/api/tasks");

        Assert.NotNull(tasks);
        Assert.Empty(tasks);
    }

    [Fact]
    public async Task Create_task_requires_title()
    {
        var response = await client.PostAsJsonAsync("/api/tasks", new { title = " " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Update_task_requires_title()
    {
        var response = await client.PutAsJsonAsync("/api/tasks/1", new { title = " ", done = true });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_task_accepts_planning_fields()
    {
        var createResponse = await client.PostAsJsonAsync("/api/tasks", new
        {
            title = "Plan sprint",
            priority = "medium",
            due = "2026-07-01",
            estimateMinutes = 45
        });
        createResponse.EnsureSuccessStatusCode();

        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Plan sprint", created.GetProperty("title").GetString());
        Assert.Equal("medium", created.GetProperty("priority").GetString());
        Assert.Equal("2026-07-01", created.GetProperty("due").GetString());
        Assert.Equal(45, created.GetProperty("estimateMinutes").GetInt32());
    }

    [Fact]
    public async Task Tasks_can_be_created_updated_and_deleted()
    {
        var createResponse = await client.PostAsJsonAsync("/api/tasks", new { title = " Write API tests " });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetInt32();
        Assert.Equal("Write API tests", created.GetProperty("title").GetString());
        Assert.False(created.GetProperty("done").GetBoolean());
        Assert.Equal("none", created.GetProperty("priority").GetString());
        Assert.Equal(JsonValueKind.Null, created.GetProperty("due").ValueKind);
        Assert.Equal(JsonValueKind.Null, created.GetProperty("estimateMinutes").ValueKind);

        var updateResponse = await client.PutAsJsonAsync($"/api/tasks/{id}", new
        {
            title = " Ship API tests ",
            done = true,
            priority = "high",
            due = "2026-06-25",
            estimateMinutes = 30
        });
        updateResponse.EnsureSuccessStatusCode();

        var updated = await updateResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Ship API tests", updated.GetProperty("title").GetString());
        Assert.True(updated.GetProperty("done").GetBoolean());
        Assert.Equal("high", updated.GetProperty("priority").GetString());
        Assert.Equal("2026-06-25", updated.GetProperty("due").GetString());
        Assert.Equal(30, updated.GetProperty("estimateMinutes").GetInt32());

        var deleteResponse = await client.DeleteAsync($"/api/tasks/{id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var getDeletedResponse = await client.GetAsync($"/api/tasks/{id}");
        Assert.Equal(HttpStatusCode.NotFound, getDeletedResponse.StatusCode);
    }

    [Fact]
    public async Task Create_task_accepts_project_and_recurrence()
    {
        var createResponse = await client.PostAsJsonAsync("/api/tasks", new
        {
            title = "Standup",
            project = "Work",
            recurrence = "weekdays"
        });
        createResponse.EnsureSuccessStatusCode();

        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("work", created.GetProperty("project").GetString());
        Assert.Equal("weekdays", created.GetProperty("recurrence").GetString());
    }
}

public sealed class CoachApiTests : IClassFixture<TaskApiFactory>
{
    private readonly TaskApiFactory factory;
    private readonly HttpClient client;

    public CoachApiTests(TaskApiFactory factory)
    {
        this.factory = factory;
        client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-User-ID", Guid.NewGuid().ToString());
    }

    [Fact]
    public async Task Coach_chat_requires_user_header()
    {
        var unauthenticated = factory.CreateClient();

        var response = await unauthenticated.PostAsJsonAsync("/api/coach/chat", new
        {
            question = "What should I focus on?",
            snapshot = SampleSnapshot()
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

  [Fact]
  public async Task Coach_chat_returns_stub_reply()
  {
    var response = await client.PostAsJsonAsync("/api/coach/chat", new
    {
      question = "What should I focus on today?",
      snapshot = SampleSnapshot()
    });

    response.EnsureSuccessStatusCode();
    var body = await response.Content.ReadFromJsonAsync<JsonElement>();
    Assert.Equal(JsonValueKind.String, body.GetProperty("text").ValueKind);
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("text").GetString()));
    Assert.Equal("local", body.GetProperty("source").GetString());
  }

  [Fact]
  public async Task Coach_chat_can_propose_schedule()
  {
    var userId = Guid.NewGuid().ToString();
    var scheduleClient = factory.CreateClient();
    scheduleClient.DefaultRequestHeaders.Add("X-User-ID", userId);

    await scheduleClient.PostAsJsonAsync("/api/tasks", new { title = "Write docs" });
    await scheduleClient.PostAsJsonAsync("/api/tasks", new { title = "Ship feature" });

    var response = await scheduleClient.PostAsJsonAsync("/api/coach/chat", new
    {
      question = "Build a schedule for this week",
      snapshot = SampleSnapshot()
    });

    response.EnsureSuccessStatusCode();
    var body = await response.Content.ReadFromJsonAsync<JsonElement>();
    Assert.True(body.TryGetProperty("schedule", out var schedule));
    Assert.Equal(JsonValueKind.Array, schedule.ValueKind);
    Assert.True(schedule.GetArrayLength() >= 1);
  }

  [Fact]
  public async Task Coach_chat_can_propose_workout_plan_after_confirmation()
  {
    var response = await client.PostAsJsonAsync("/api/coach/chat", new
    {
      question = "ok",
      snapshot = SampleSnapshot(),
      history = new[]
      {
        new { role = "user", content = "Create a 30 day workout plan" },
        new { role = "assistant", content = "I can build a 30-day workout plan on your calendar." }
      }
    });

    response.EnsureSuccessStatusCode();
    var body = await response.Content.ReadFromJsonAsync<JsonElement>();
    Assert.True(body.TryGetProperty("schedule", out var schedule));
    Assert.Equal(JsonValueKind.Array, schedule.ValueKind);
    Assert.Equal(30, schedule.GetArrayLength());
    Assert.Equal(JsonValueKind.Null, schedule[0].GetProperty("taskId").ValueKind);
    Assert.False(string.IsNullOrWhiteSpace(schedule[0].GetProperty("title").GetString()));
    Assert.True(schedule[0].TryGetProperty("checklist", out var checklist));
    Assert.True(checklist.GetArrayLength() >= 3);
  }

  [Fact]
  public async Task Tasks_can_store_checklist()
  {
    var createResponse = await client.PostAsJsonAsync("/api/tasks", new
    {
      title = "Workout Day 1",
      checklist = new[]
      {
        new { id = "a1", title = "Warm-up", done = false },
        new { id = "a2", title = "Squats 3x12", done = false }
      }
    });

    createResponse.EnsureSuccessStatusCode();
    var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
    Assert.Equal(2, created.GetProperty("checklist").GetArrayLength());
  }

    private static object SampleSnapshot() => new
    {
        overdueCount = 1,
        dueTodayCount = 2,
        upcomingCount = 3,
        unscheduledCount = 4,
        isOvercommitted = true,
        todayEstimatedLabel = "6h",
        dayCapacityLabel = "8h",
        topOverdueTitles = new[] { "Old task" },
        topUnscheduledTitles = new[] { "Loose task" },
        highPriorityOpenCount = 1
    };
}

public sealed class TaskApiFactory : WebApplicationFactory<Program>
{
    private readonly string databasePath = Path.Combine(Path.GetTempPath(), $"task-tracker-tests-{Guid.NewGuid():N}.db");

    public TaskApiFactory()
    {
        Environment.SetEnvironmentVariable("ConnectionStrings__Tasks", $"Data Source={databasePath}");
        Environment.SetEnvironmentVariable("Coach__Provider", "Stub");
    }

    protected override void Dispose(bool disposing)
    {
        Environment.SetEnvironmentVariable("ConnectionStrings__Tasks", null);
        Environment.SetEnvironmentVariable("Coach__Provider", null);

        DeleteIfExists(databasePath);
        DeleteIfExists($"{databasePath}-shm");
        DeleteIfExists($"{databasePath}-wal");

        base.Dispose(disposing);
    }

    private static void DeleteIfExists(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }
}
