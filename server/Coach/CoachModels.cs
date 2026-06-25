namespace TaskTracker.Coach;

using TaskTracker;

public record CoachTaskItem(
    int Id,
    string Title,
    string? Due,
    string Priority,
    int? EstimateMinutes
);

/// <summary>Schedule an existing task (TaskId set) or create a new one (Title set, TaskId null).</summary>
public record ScheduleAssignment(
    int? TaskId,
    string Due,
    string? Title = null,
    int? EstimateMinutes = null,
    IReadOnlyList<ChecklistItem>? Checklist = null
);

public record CoachChatMessage(string Role, string Content);

public record CoachProviderResult(string Text, IReadOnlyList<ScheduleAssignment> Assignments);

public record CoachTaskSnapshot(
    int OverdueCount,
    int DueTodayCount,
    int UpcomingCount,
    int UnscheduledCount,
    bool IsOvercommitted,
    string TodayEstimatedLabel,
    string DayCapacityLabel,
    string[] TopOverdueTitles,
    string[] TopUnscheduledTitles,
    int HighPriorityOpenCount
);

public record CoachChatRequest(
    string? Question,
    CoachTaskSnapshot Snapshot,
    IReadOnlyList<CoachChatMessage>? History = null
);

public record CoachChatResponse(
    string Text,
    string Source,
    IReadOnlyList<ScheduleAssignment>? Schedule = null
);
