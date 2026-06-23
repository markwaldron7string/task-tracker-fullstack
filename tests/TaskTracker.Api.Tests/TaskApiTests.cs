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
    public async Task Tasks_can_be_created_updated_and_deleted()
    {
        var createResponse = await client.PostAsJsonAsync("/api/tasks", new { title = " Write API tests " });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetInt32();
        Assert.Equal("Write API tests", created.GetProperty("title").GetString());
        Assert.False(created.GetProperty("done").GetBoolean());

        var updateResponse = await client.PutAsJsonAsync($"/api/tasks/{id}", new { title = " Ship API tests ", done = true });
        updateResponse.EnsureSuccessStatusCode();

        var updated = await updateResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Ship API tests", updated.GetProperty("title").GetString());
        Assert.True(updated.GetProperty("done").GetBoolean());

        var deleteResponse = await client.DeleteAsync($"/api/tasks/{id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var getDeletedResponse = await client.GetAsync($"/api/tasks/{id}");
        Assert.Equal(HttpStatusCode.NotFound, getDeletedResponse.StatusCode);
    }
}

public sealed class TaskApiFactory : WebApplicationFactory<Program>
{
    private readonly string databasePath = Path.Combine(Path.GetTempPath(), $"task-tracker-tests-{Guid.NewGuid():N}.db");

    public TaskApiFactory()
    {
        Environment.SetEnvironmentVariable("ConnectionStrings__Tasks", $"Data Source={databasePath}");
    }

    protected override void Dispose(bool disposing)
    {
        Environment.SetEnvironmentVariable("ConnectionStrings__Tasks", null);

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
