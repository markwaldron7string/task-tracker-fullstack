namespace TaskTracker.Coach;

public interface ICoachProvider
{
    string Name { get; }

    Task<CoachProviderResult> GetReplyAsync(
        string question,
        CoachTaskSnapshot snapshot,
        IReadOnlyList<CoachTaskItem> tasks,
        IReadOnlyList<CoachChatMessage> history,
        CancellationToken cancellationToken);
}
