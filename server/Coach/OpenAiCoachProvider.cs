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
        IReadOnlyList<ScheduleAssignment>? currentSchedule,
        bool reviseSchedule,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(options.ApiKey))
            throw new InvalidOperationException("Coach API key is not configured.");

        if (CoachScheduleHelper.IsVagueRequest(question, history))
        {
            return new CoachProviderResult(
                CoachScheduleHelper.BuildClarifyingQuestion(question),
                Array.Empty<ScheduleAssignment>(),
                AwaitingReply: true);
        }

        var scheduleMode = CoachScheduleHelper.ShouldUseScheduleMode(
            question, history, currentSchedule, reviseSchedule);
        var systemPrompt = scheduleMode
            ? BuildScheduleSystemPrompt(snapshot, tasks, history, currentSchedule)
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
            return CoachScheduleHelper.ParseStructuredResponse(content, tasks, currentSchedule);

        var awaitingReply = CoachScheduleHelper.IsAwaitingReply(content);
        return new CoachProviderResult(content, Array.Empty<ScheduleAssignment>(), AwaitingReply: awaitingReply);
    }

    internal static string BuildSystemPrompt(CoachTaskSnapshot snapshot, IReadOnlyList<CoachTaskItem> tasks)
    {
        return $"""
            You are a concise planning coach inside a personal task tracker app.
            Answer in 2-4 short sentences. Be practical and encouraging, not preachy.

            When the user's request is vague or missing key details (no timeframe, goal type, or scope), ask ONE friendly follow-up question before suggesting or building anything. End clarifying questions with a question mark. Do not generate calendar assignments until the user gives specifics like plan type and duration. Examples of vague input: "help me", "make a plan", "I need a schedule", "something for wellness" without days or specifics.

            When the user is answering your prior clarifying question with enough detail, give a direct helpful answer or explain what you will schedule.

            When the user asks for a multi-day plan with enough detail (workout, habit, routine, wellness, including duration), tell them you can generate calendar tasks they can apply with one click — do not ask them to reply "ok"; instead explain what you will put on the calendar and that they should ask you to "build the schedule" or say "create it" if they want the calendar entries now.

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
        IReadOnlyList<CoachChatMessage> history,
        IReadOnlyList<ScheduleAssignment>? currentSchedule)
    {
        var today = DateOnly.FromDateTime(DateTime.Now).ToString("yyyy-MM-dd");
        const string jsonShape = """
            {"message":"one short sentence summary tag","overview":"1-2 paragraphs explaining the plan goals, rhythm, and what the user should expect","assignments":[{"title":"Day 1 – Lower body","due":"YYYY-MM-DD","estimateMinutes":45,"checklist":[{"title":"Warm-up: 5 min walk","done":false},{"title":"Squats 3×12","done":false},{"title":"Breakfast: oatmeal + protein","done":false}]}]}
            """;
        var historyNote = history.Count > 0
            ? "Use the conversation history. If the user is confirming a plan you already outlined, generate the full calendar assignments now."
            : "If the user asked for a multi-day plan, create one task per day with clear titles and a specific checklist for that day.";
        var revisionNote = currentSchedule is { Count: > 0 }
            ? $"""
              
              The user already has a proposed schedule (not yet applied). Revise it based on their latest message.
              Current proposed schedule JSON:
              {JsonSerializer.Serialize(currentSchedule.Select(assignment => new
              {
                  assignment.TaskId,
                  assignment.Title,
                  assignment.Due,
                  assignment.EstimateMinutes,
                  checklist = assignment.Checklist?.Select(item => new { item.Title, item.Done })
              }))}
              Return the FULL updated schedule in assignments — not a diff. Keep what still fits and adjust titles, dates, or checklists as requested.
              """
            : string.Empty;

        return $"""
            You are a scheduling assistant for a personal task tracker.
            Return ONLY valid JSON with this shape:
            {jsonShape}

            Rules:
            - message is a brief one-line tag shown under the chat reply (under ~120 characters).
            - overview is 1-2 short paragraphs explaining the plan's purpose, structure, and how to use it.
            - assignments may schedule EXISTING tasks using taskId + due, OR CREATE new tasks using title + due (omit taskId for new tasks).
            - For plans like workouts, habits, or N-day routines: create one new task per day with descriptive titles (up to {CoachScheduleHelper.MaxAssignments} days).
            - Each day task MUST include a checklist array with 4–8 specific, actionable items for that day (exercises with sets/reps, meals with foods, or habit steps). Tailor items to the user's goal (e.g. fat loss, muscle gain, meal plan).
            - Checklist titles should be concise but specific — not generic placeholders.
            - Prefer scheduling unscheduled existing tasks before creating duplicates.
            - Spread work across calendar days starting from today ({today}) unless the user specified otherwise.
            - Respect day capacity ({snapshot.DayCapacityLabel}); add estimateMinutes when helpful (e.g. 45 for workouts).
            - Put the full plan in assignments immediately — do NOT ask the user to reply ok or confirm. Tell them to click Apply to calendar.
            - Do NOT reuse topics from earlier conversation unless the user's current message clearly continues that same plan.
            - {historyNote}{revisionNote}

            Open tasks JSON:
            {CoachScheduleHelper.SerializeTasksForPrompt(tasks)}
            """;
    }
}
