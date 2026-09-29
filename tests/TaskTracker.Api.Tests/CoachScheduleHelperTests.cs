using TaskTracker.Coach;

namespace TaskTracker.Api.Tests;

public sealed class CoachScheduleHelperTests
{
    [Theory]
    [InlineData("make a plan")]
    [InlineData("help me")]
    [InlineData("build a schedule")]
    public void Treats_underspecified_prompts_as_vague(string question)
    {
        Assert.True(CoachScheduleHelper.IsVagueRequest(question, []));
        Assert.False(CoachScheduleHelper.IsScheduleRequest(question, []));
    }

    [Theory]
    [InlineData("build me a schedule")]
    [InlineData("Build a schedule for this week")]
    [InlineData("create a task list for moving")]
    [InlineData("Create a 7-day study schedule")]
    public void Treats_actionable_plan_prompts_as_schedule_requests(string question)
    {
        Assert.False(CoachScheduleHelper.IsVagueRequest(question, []));
        Assert.True(CoachScheduleHelper.IsScheduleRequest(question, []));
    }

    [Fact]
    public void Builds_a_task_list_without_existing_tasks()
    {
        var schedule = CoachScheduleHelper.BuildStubSchedule(
            "create a task list for moving apartments",
            [],
            []);

        Assert.True(schedule.Count >= 5);
        Assert.All(schedule, item => Assert.Null(item.TaskId));
        Assert.Contains(schedule, item => (item.Title ?? "").Contains("Pack", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Parses_json_wrapped_in_markdown_fences()
    {
        var json = """
            ```json
            {"message":"7-day study plan","overview":"Review then practice.","assignments":[{"title":"Day 1 – Review","due":"2026-08-31","estimateMinutes":40,"checklist":[{"title":"Read notes","done":false}]}]}
            ```
            """;

        var result = CoachScheduleHelper.ParseStructuredResponse(json, []);

        Assert.Equal("7-day study plan", result.Text);
        Assert.Single(result.Assignments);
        Assert.Equal("Day 1 – Review", result.Assignments[0].Title);
        Assert.NotNull(result.Assignments[0].Checklist);
        Assert.Single(result.Assignments[0].Checklist!);
    }

    [Fact]
    public void Gemini_key_selects_free_flash_model()
    {
        var resolved = CoachLlmSettings.Resolve(new CoachOptions
        {
            Provider = "Auto",
            ApiKey = "AIza-test-key",
            Model = "gpt-4o-mini",
            Endpoint = "https://api.openai.com/v1/chat/completions",
        });

        Assert.False(resolved.UseStub);
        Assert.Equal("gemini", resolved.Kind);
        Assert.Equal(CoachLlmSettings.GeminiModel, resolved.Model);
        Assert.Equal(CoachLlmSettings.GeminiEndpoint, resolved.Endpoint);
        Assert.True(resolved.DisableThinking);
    }

    [Fact]
    public void Missing_key_uses_stub()
    {
        var resolved = CoachLlmSettings.Resolve(new CoachOptions { Provider = "Auto" });
        Assert.True(resolved.UseStub);
    }
}
