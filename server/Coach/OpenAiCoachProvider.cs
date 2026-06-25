using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace TaskTracker.Coach;

public sealed class OpenAiCoachProvider : ICoachProvider
{
    private readonly HttpClient httpClient;
    private readonly CoachOptions options;

    public OpenAiCoachProvider(HttpClient httpClient, IOptions<CoachOptions> options)
    {
        this.httpClient = httpClient;
        this.options = options.Value;
    }

    public string Name => "ai";

    public async Task<CoachProviderResult> GetReplyAsync(
        string question,
        CoachTaskSnapshot snapshot,
        IReadOnlyList<CoachTaskItem> tasks,
        IReadOnlyList<CoachChatMessage> history,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(options.ApiKey))
            throw new InvalidOperationException("Coach API key is not configured.");

        var scheduleMode = CoachScheduleHelper.IsScheduleRequest(question, history);
        var systemPrompt = scheduleMode
            ? BuildScheduleSystemPrompt(snapshot, tasks, history)
            : BuildSystemPrompt(snapshot, tasks);

        var messages = new List<object> { new { role = "system", content = systemPrompt } };
        foreach (var turn in history)
        {
            messages.Add(new { role = turn.Role, content = turn.Content });
        }
        messages.Add(new { role = "user", content = question.Trim() });

        var payload = new Dictionary<string, object?>
        {
            ["model"] = options.Model,
            ["max_tokens"] = scheduleMode ? Math.Max(options.ScheduleMaxTokens, options.MaxTokens) : options.MaxTokens,
            ["temperature"] = scheduleMode ? 0.35 : 0.6,
            ["messages"] = messages
        };

        if (scheduleMode)
            payload["response_format"] = new { type = "json_object" };

        using var request = new HttpRequestMessage(HttpMethod.Post, options.Endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);

        var content = document.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();

        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("Coach model returned an empty response.");

        content = content.Trim();
        if (scheduleMode)
            return CoachScheduleHelper.ParseStructuredResponse(content, tasks);

        return new CoachProviderResult(content, Array.Empty<ScheduleAssignment>());
    }

    internal static string BuildSystemPrompt(CoachTaskSnapshot snapshot, IReadOnlyList<CoachTaskItem> tasks)
    {
        return $"""
            You are a concise planning coach inside a personal task tracker app.
            Answer in 2-4 short sentences. Be practical and encouraging, not preachy.
            When the user asks for a multi-day plan (workout, habit, routine), tell them you can generate calendar tasks they can apply with one click — do not ask them to reply "ok"; instead explain what you will put on the calendar and that they should ask you to "build the schedule" or say "create it" if they want the calendar entries now.

            Task snapshot:
            - Overdue count: {snapshot.OverdueCount}
            - Due today: {snapshot.DueTodayCount}
            - Upcoming (future dated): {snapshot.UpcomingCount}
            - Unscheduled active: {snapshot.UnscheduledCount}
            - High-priority open: {snapshot.HighPriorityOpenCount}
            - Today estimated work: {snapshot.TodayEstimatedLabel}
            - Day capacity: {snapshot.DayCapacityLabel}
            - Overcommitted today: {(snapshot.IsOvercommitted ? "yes" : "no")}

            Open tasks JSON:
            {CoachScheduleHelper.SerializeTasksForPrompt(tasks)}
            """;
    }

    internal static string BuildScheduleSystemPrompt(
        CoachTaskSnapshot snapshot,
        IReadOnlyList<CoachTaskItem> tasks,
        IReadOnlyList<CoachChatMessage> history)
    {
        var today = DateOnly.FromDateTime(DateTime.Now).ToString("yyyy-MM-dd");
        const string jsonShape = """
            {"message":"summary for the user","assignments":[{"title":"Day 1 – Lower body","due":"YYYY-MM-DD","estimateMinutes":45,"checklist":[{"title":"Warm-up: 5 min walk","done":false},{"title":"Squats 3×12","done":false},{"title":"Breakfast: oatmeal + protein","done":false}]}]}
            """;
        var historyNote = history.Count > 0
            ? "Use the conversation history. If the user is confirming a plan you already outlined, generate the full calendar assignments now."
            : "If the user asked for a multi-day plan, create one task per day with clear titles and a specific checklist for that day.";

        return $"""
            You are a scheduling assistant for a personal task tracker.
            Return ONLY valid JSON with this shape:
            {jsonShape}

            Rules:
            - assignments may schedule EXISTING tasks using taskId + due, OR CREATE new tasks using title + due (omit taskId for new tasks).
            - For plans like workouts, habits, or N-day routines: create one new task per day with descriptive titles (up to {CoachScheduleHelper.MaxAssignments} days).
            - Each day task MUST include a checklist array with 4–8 specific, actionable items for that day (exercises with sets/reps, meals with foods, or habit steps). Tailor items to the user's goal (e.g. fat loss, muscle gain, meal plan).
            - Checklist titles should be concise but specific — not generic placeholders.
            - Prefer scheduling unscheduled existing tasks before creating duplicates.
            - Spread work across calendar days starting from today ({today}) unless the user specified otherwise.
            - Respect day capacity ({snapshot.DayCapacityLabel}); add estimateMinutes when helpful (e.g. 45 for workouts).
            - Put the full plan in assignments immediately — do NOT ask the user to reply ok or confirm. Tell them to click Apply to calendar.
            - {historyNote}

            Open tasks JSON:
            {CoachScheduleHelper.SerializeTasksForPrompt(tasks)}
            """;
    }
}
