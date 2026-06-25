using Microsoft.Extensions.Options;

namespace TaskTracker.Coach;

public sealed class CoachService
{
    private readonly CoachOptions options;
    private readonly StubCoachProvider stubProvider;
    private readonly OpenAiCoachProvider openAiProvider;

    public CoachService(
        IOptions<CoachOptions> options,
        StubCoachProvider stubProvider,
        OpenAiCoachProvider openAiProvider)
    {
        this.options = options.Value;
        this.stubProvider = stubProvider;
        this.openAiProvider = openAiProvider;
    }

    public async Task<CoachChatResponse> ChatAsync(
        string? question,
        CoachTaskSnapshot snapshot,
        IReadOnlyList<CoachTaskItem> tasks,
        IReadOnlyList<CoachChatMessage>? history,
        CancellationToken cancellationToken)
    {
        var normalizedQuestion = question?.Trim() ?? "";
        var normalizedHistory = NormalizeHistory(history);
        var provider = ResolveProvider();

        try
        {
            var result = await provider.GetReplyAsync(
                normalizedQuestion,
                snapshot,
                tasks,
                normalizedHistory,
                cancellationToken);

            var schedule = result.Assignments.Count > 0
                ? CoachScheduleHelper.EnrichWithTitles(
                    CoachScheduleHelper.NormalizeAssignments(result.Assignments, tasks),
                    tasks)
                : Array.Empty<ScheduleAssignment>();

            return new CoachChatResponse(
                result.Text,
                provider.Name,
                schedule.Count > 0 ? schedule : null);
        }
        catch when (provider != stubProvider)
        {
            var fallback = await stubProvider.GetReplyAsync(
                normalizedQuestion,
                snapshot,
                tasks,
                normalizedHistory,
                cancellationToken);
            var schedule = fallback.Assignments.Count > 0 ? fallback.Assignments : null;
            return new CoachChatResponse(fallback.Text, stubProvider.Name, schedule);
        }
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
        var provider = options.Provider.Trim().ToLowerInvariant();
        return provider switch
        {
            "stub" => stubProvider,
            "openai" => openAiProvider,
            _ => string.IsNullOrWhiteSpace(options.ApiKey) ? stubProvider : openAiProvider,
        };
    }
}
