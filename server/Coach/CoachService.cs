using Microsoft.Extensions.Options;

namespace TaskTracker.Coach;

public sealed class CoachService
{
    private readonly CoachOptions options;
    private readonly StubCoachProvider stubProvider;
    private readonly OpenAiCoachProvider openAiProvider;
    private readonly ILogger<CoachService> logger;

    public CoachService(
        IOptions<CoachOptions> options,
        StubCoachProvider stubProvider,
        OpenAiCoachProvider openAiProvider,
        ILogger<CoachService> logger)
    {
        this.options = options.Value;
        this.stubProvider = stubProvider;
        this.openAiProvider = openAiProvider;
        this.logger = logger;
    }

    public async Task<CoachChatResponse> ChatAsync(
        string? question,
        CoachTaskSnapshot snapshot,
        IReadOnlyList<CoachTaskItem> tasks,
        IReadOnlyList<CoachChatMessage>? history,
        IReadOnlyList<ScheduleAssignment>? currentSchedule,
        bool reviseSchedule,
        CancellationToken cancellationToken)
    {
        var normalizedQuestion = question?.Trim() ?? "";
        var normalizedHistory = NormalizeHistory(history);
        var normalizedSchedule = NormalizeCurrentSchedule(currentSchedule, tasks);
        var provider = ResolveProvider();

        try
        {
            var result = await provider.GetReplyAsync(
                normalizedQuestion,
                snapshot,
                tasks,
                normalizedHistory,
                normalizedSchedule,
                reviseSchedule,
                cancellationToken);

            var schedule = result.Assignments.Count > 0
                ? CoachScheduleHelper.EnrichWithTitles(
                    CoachScheduleHelper.NormalizeAssignments(result.Assignments, tasks),
                    tasks)
                : Array.Empty<ScheduleAssignment>();

            if (schedule.Count == 0 &&
                provider != stubProvider &&
                !result.AwaitingReply &&
                CoachScheduleHelper.IsScheduleRequest(normalizedQuestion, normalizedHistory))
            {
                var fallbackPlan = await stubProvider.GetReplyAsync(
                    normalizedQuestion,
                    snapshot,
                    tasks,
                    normalizedHistory,
                    normalizedSchedule,
                    reviseSchedule,
                    cancellationToken);
                if (fallbackPlan.Assignments.Count > 0)
                {
                    logger.LogInformation("Coach LLM returned no assignments; using local plan builder.");
                    return ToResponse(fallbackPlan, stubProvider.Name, tasks);
                }
            }

            return new CoachChatResponse(
                result.Text,
                provider.Name,
                schedule.Count > 0 ? schedule : null,
                result.Overview,
                result.AwaitingReply);
        }
        catch (Exception ex) when (provider != stubProvider)
        {
            logger.LogWarning(ex, "Coach LLM provider failed; falling back to local planner.");
            var fallback = await stubProvider.GetReplyAsync(
                normalizedQuestion,
                snapshot,
                tasks,
                normalizedHistory,
                normalizedSchedule,
                reviseSchedule,
                cancellationToken);
            return ToResponse(fallback, stubProvider.Name, tasks);
        }
    }

    private static CoachChatResponse ToResponse(
        CoachProviderResult result,
        string source,
        IReadOnlyList<CoachTaskItem> tasks)
    {
        var schedule = result.Assignments.Count > 0
            ? CoachScheduleHelper.EnrichWithTitles(
                CoachScheduleHelper.NormalizeAssignments(result.Assignments, tasks),
                tasks)
            : null;

        return new CoachChatResponse(
            result.Text,
            source,
            schedule is { Count: > 0 } ? schedule : null,
            result.Overview,
            result.AwaitingReply);
    }

    private static IReadOnlyList<ScheduleAssignment>? NormalizeCurrentSchedule(
        IReadOnlyList<ScheduleAssignment>? currentSchedule,
        IReadOnlyList<CoachTaskItem> tasks)
    {
        if (currentSchedule is null || currentSchedule.Count == 0)
            return null;

        return CoachScheduleHelper.EnrichWithTitles(
            CoachScheduleHelper.NormalizeAssignments(currentSchedule, tasks),
            tasks);
    }

    private static IReadOnlyList<CoachChatMessage> NormalizeHistory(IReadOnlyList<CoachChatMessage>? history)
    {
        if (history is null || history.Count == 0)
            return Array.Empty<CoachChatMessage>();

        return history
            .Where(message =>
                !string.IsNullOrWhiteSpace(message.Content) &&
                (string.Equals(message.Role, "user", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase)))
            .TakeLast(8)
            .Select(message => new CoachChatMessage(
                message.Role.ToLowerInvariant(),
                message.Content.Trim()))
            .ToList();
    }

    private ICoachProvider ResolveProvider()
    {
        var settings = CoachLlmSettings.Resolve(options);
        return settings.UseStub ? stubProvider : openAiProvider;
    }
}
