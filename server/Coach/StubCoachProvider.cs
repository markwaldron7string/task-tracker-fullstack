using System.Text.RegularExpressions;

namespace TaskTracker.Coach;

/// <summary>Rule-based coach for dev/test when no LLM key is configured.</summary>
public sealed class StubCoachProvider : ICoachProvider
{
    public string Name => "local";

    public Task<CoachProviderResult> GetReplyAsync(
        string question,
        CoachTaskSnapshot snapshot,
        IReadOnlyList<CoachTaskItem> tasks,
        IReadOnlyList<CoachChatMessage> history,
        CancellationToken cancellationToken)
    {
        var q = question.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(q))
        {
            return Task.FromResult(new CoachProviderResult(
                "Ask me what to focus on, whether you're overcommitted, or say \"build a schedule for this week\".",
                Array.Empty<ScheduleAssignment>()));
        }

        if (CoachScheduleHelper.IsScheduleRequest(question, history))
        {
            var schedule = CoachScheduleHelper.BuildStubSchedule(question, history, tasks);
            if (schedule.Count == 0)
            {
                return Task.FromResult(new CoachProviderResult(
                    "No unscheduled tasks to move onto the calendar. Ask me to create a plan like \"30 day workout plan\" and I'll add new tasks you can apply.",
                    Array.Empty<ScheduleAssignment>()));
            }

            var isNewPlan = schedule.All(assignment => assignment.TaskId is null);
            var message = isNewPlan
                ? $"I created a {schedule.Count}-day plan with new calendar tasks. Review below and apply to your calendar."
                : $"I spread {schedule.Count} unscheduled task{(schedule.Count == 1 ? "" : "s")} across the next open weekdays. Review the plan below and apply it to your calendar.";

            return Task.FromResult(new CoachProviderResult(message, schedule));
        }

        if (Regex.IsMatch(q, @"overdue|late|behind"))
        {
            return Task.FromResult(new CoachProviderResult(
                snapshot.OverdueCount > 0
                    ? $"You have {snapshot.OverdueCount} overdue. I'd tackle \"{FirstOr(snapshot.TopOverdueTitles, "the oldest one")}\" first, or roll them to today if the list is stale."
                    : "Nothing overdue — nice work staying current.",
                Array.Empty<ScheduleAssignment>()));
        }

        if (Regex.IsMatch(q, @"today|focus|now|start"))
        {
            if (snapshot.DueTodayCount > 0)
            {
                var over = snapshot.IsOvercommitted ? $", but the day is over {snapshot.DayCapacityLabel}" : "";
                return Task.FromResult(new CoachProviderResult(
                    $"{snapshot.DueTodayCount} due today{over}. Protect time for high-priority items before adding more.",
                    Array.Empty<ScheduleAssignment>()));
            }

            return Task.FromResult(new CoachProviderResult(
                snapshot.UnscheduledCount > 0
                    ? $"Nothing due today. You have {snapshot.UnscheduledCount} unscheduled — pick one and give it a date."
                    : "Nothing due today. Good moment for deep work or clearing small tasks.",
                Array.Empty<ScheduleAssignment>()));
        }

        if (Regex.IsMatch(q, @"overcommit|too much|capacity|hours|realistic"))
        {
            return Task.FromResult(new CoachProviderResult(
                snapshot.IsOvercommitted
                    ? $"Yes — {snapshot.TodayEstimatedLabel} planned vs {snapshot.DayCapacityLabel} capacity. Move something out or shrink estimates."
                    : $"You're within capacity ({snapshot.TodayEstimatedLabel} / {snapshot.DayCapacityLabel}). Room to add one more focused block.",
                Array.Empty<ScheduleAssignment>()));
        }

        return Task.FromResult(new CoachProviderResult(
            "Try asking about today, overdue items, or say \"build a schedule for this week\".",
            Array.Empty<ScheduleAssignment>()));
    }

    private static string FirstOr(string[] values, string fallback) =>
        values.Length > 0 && !string.IsNullOrWhiteSpace(values[0]) ? values[0] : fallback;
}
