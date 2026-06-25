using System.Text.Json;
using System.Text.RegularExpressions;
using TaskTracker;

namespace TaskTracker.Coach;

public static class CoachScheduleHelper
{
    private static readonly Regex ScheduleIntent = new(
        @"\b(schedule|plan|build\s+(a\s+)?schedule|assign|spread|calendar|this\s+week|next\s+week|week\s+plan|routine|program|workout|habit)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex MultiDayPlanIntent = new(
        @"\b(\d+\s*day|month|weekly|routine|workout|training|habit)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex ConfirmationIntent = new(
        @"^(ok|okay|yes|yep|yeah|sure|do it|go ahead|proceed|sounds good|let'?s do it|please do|apply it|create it|make it)\.?!?$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex IsoDate = new(@"^\d{4}-\d{2}-\d{2}$");

    public const int MaxAssignments = 31;

    public static bool IsScheduleRequest(string question, IReadOnlyList<CoachChatMessage>? history)
    {
        var trimmed = question.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return false;

        if (ScheduleIntent.IsMatch(trimmed) || MultiDayPlanIntent.IsMatch(trimmed))
            return true;

        return ConfirmationIntent.IsMatch(trimmed) && HistoryIndicatesPendingPlan(history);
    }

    public static IReadOnlyList<ScheduleAssignment> NormalizeAssignments(
        IEnumerable<ScheduleAssignment> assignments,
        IReadOnlyList<CoachTaskItem> tasks)
    {
        var taskIds = tasks.Select(task => task.Id).ToHashSet();
        var seenIds = new HashSet<int>();
        var seenTitles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var valid = new List<ScheduleAssignment>();

        foreach (var assignment in assignments)
        {
            if (!IsValidDueDate(assignment.Due))
                continue;

            if (assignment.TaskId is int taskId)
            {
                if (!taskIds.Contains(taskId) || !seenIds.Add(taskId))
                    continue;

                valid.Add(EnrichExisting(assignment, tasks));
                continue;
            }

            var title = assignment.Title?.Trim();
            if (string.IsNullOrWhiteSpace(title) || !seenTitles.Add(title))
                continue;

            valid.Add(assignment with { Title = title, TaskId = null });
        }

        return valid.Take(MaxAssignments).ToList();
    }

    public static IReadOnlyList<ScheduleAssignment> EnrichWithTitles(
        IReadOnlyList<ScheduleAssignment> assignments,
        IReadOnlyList<CoachTaskItem> tasks)
    {
        var titles = tasks.ToDictionary(task => task.Id, task => task.Title);
        return assignments
            .Select(assignment => assignment.TaskId is int taskId && titles.TryGetValue(taskId, out var title)
                ? assignment with { Title = title }
                : assignment)
            .ToList();
    }

    public static IReadOnlyList<ScheduleAssignment> BuildStubSchedule(
        string question,
        IReadOnlyList<CoachChatMessage>? history,
        IReadOnlyList<CoachTaskItem> tasks)
    {
        var planQuestion = ResolvePlanQuestion(question, history);
        var workout = BuildStubWorkoutPlan(planQuestion);
        if (workout.Count > 0)
            return workout;

        return BuildStubReschedule(tasks);
    }

    public static IReadOnlyList<ScheduleAssignment> BuildStubReschedule(IReadOnlyList<CoachTaskItem> tasks)
    {
        var priorityRank = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["high"] = 3,
            ["medium"] = 2,
            ["low"] = 1,
            ["none"] = 0,
        };

        var candidates = tasks
            .Where(task => string.IsNullOrWhiteSpace(task.Due))
            .OrderByDescending(task => priorityRank.GetValueOrDefault(task.Priority, 0))
            .ThenBy(task => task.Id)
            .Take(7)
            .ToList();

        if (candidates.Count == 0)
            return Array.Empty<ScheduleAssignment>();

        var assignments = new List<ScheduleAssignment>();
        var day = DateOnly.FromDateTime(DateTime.Now);

        foreach (var task in candidates)
        {
            day = NextWeekday(day.AddDays(assignments.Count == 0 ? 0 : 1));
            assignments.Add(new ScheduleAssignment(task.Id, day.ToString("yyyy-MM-dd"), task.Title));
        }

        return assignments;
    }

    private static IReadOnlyList<ScheduleAssignment> BuildStubWorkoutPlan(string question)
    {
        var match = Regex.Match(question, @"(\d+)\s*day", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (!match.Success || !Regex.IsMatch(question, @"workout|training|exercise|habit|routine", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return Array.Empty<ScheduleAssignment>();

        var days = Math.Min(int.Parse(match.Groups[1].Value), MaxAssignments);
        if (days < 3)
            return Array.Empty<ScheduleAssignment>();

        var assignments = new List<ScheduleAssignment>();
        var day = DateOnly.FromDateTime(DateTime.Now);

        for (var index = 0; index < days; index++)
        {
            if (index > 0)
                day = NextWeekday(day.AddDays(1));
            else
                day = NextWeekday(day);

            assignments.Add(new ScheduleAssignment(
                null,
                day.ToString("yyyy-MM-dd"),
                $"Workout Day {index + 1}",
                45,
                BuildStubDayChecklist(index, question)));
        }

        return assignments;
    }

    private static string ResolvePlanQuestion(string question, IReadOnlyList<CoachChatMessage>? history)
    {
        if (history is not null)
        {
            foreach (var message in history.Reverse())
            {
                if (string.Equals(message.Role, "user", StringComparison.OrdinalIgnoreCase) &&
                    (MultiDayPlanIntent.IsMatch(message.Content) || ScheduleIntent.IsMatch(message.Content)))
                {
                    return message.Content;
                }
            }
        }

        return question;
    }

    private static List<ChecklistItem> BuildStubDayChecklist(int dayIndex, string question)
    {
        var includesMeals = Regex.IsMatch(question, @"meal|diet|nutrition|fat|food", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        var isRestDay = dayIndex > 0 && (dayIndex + 1) % 7 == 0;
        var items = new List<ChecklistItem>();

        if (isRestDay)
        {
            items.Add(MakeChecklistItem("20 min easy walk"));
            items.Add(MakeChecklistItem("Full-body stretching (10 min)"));
            if (includesMeals)
            {
                items.Add(MakeChecklistItem("Breakfast: Greek yogurt + berries"));
                items.Add(MakeChecklistItem("Lunch: Grilled chicken salad"));
                items.Add(MakeChecklistItem("Dinner: Baked salmon + vegetables"));
            }
            return items;
        }

        var focus = (dayIndex % 6) switch
        {
            0 => "Lower body strength",
            1 => "Upper body push",
            2 => "Cardio intervals",
            3 => "Upper body pull",
            4 => "Full-body circuit",
            _ => "Core + conditioning",
        };

        items.Add(MakeChecklistItem("Warm-up: 5 min walk + mobility"));
        items.Add(MakeChecklistItem($"{focus}: 3 sets × 12 reps"));
        items.Add(MakeChecklistItem("Finisher: 10 min brisk walk or bike"));
        items.Add(MakeChecklistItem("Cool-down: 5 min stretch"));

        if (includesMeals)
        {
            items.Add(MakeChecklistItem("Breakfast: Oatmeal + protein"));
            items.Add(MakeChecklistItem("Lunch: Turkey wrap + side salad"));
            items.Add(MakeChecklistItem("Dinner: Lean protein bowl (no refined carbs)"));
            items.Add(MakeChecklistItem("Drink 2L water"));
        }

        return items;
    }

    private static ChecklistItem MakeChecklistItem(string title) => new()
    {
        Id = Guid.NewGuid().ToString("N"),
        Title = title,
        Done = false,
    };

    public static CoachProviderResult ParseStructuredResponse(string json, IReadOnlyList<CoachTaskItem> tasks)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        var message = root.TryGetProperty("message", out var messageElement)
            ? messageElement.GetString()?.Trim()
            : null;
        if (string.IsNullOrWhiteSpace(message))
            message = "Here's a proposed schedule you can apply to your calendar.";

        var assignments = new List<ScheduleAssignment>();
        if (root.TryGetProperty("assignments", out var assignmentsElement) &&
            assignmentsElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in assignmentsElement.EnumerateArray())
            {
                if (!item.TryGetProperty("due", out var dueElement))
                    continue;

                var due = dueElement.GetString()?.Trim();
                if (!IsValidDueDate(due))
                    continue;

                int? estimate = null;
                if (item.TryGetProperty("estimateMinutes", out var estimateElement) &&
                    estimateElement.ValueKind == JsonValueKind.Number)
                {
                    estimate = estimateElement.GetInt32();
                }

                var checklist = ParseChecklist(item);

                if (item.TryGetProperty("taskId", out var idElement) &&
                    idElement.ValueKind == JsonValueKind.Number)
                {
                    assignments.Add(new ScheduleAssignment(idElement.GetInt32(), due!, Checklist: checklist, EstimateMinutes: estimate));
                    continue;
                }

                var title = item.TryGetProperty("title", out var titleElement)
                    ? titleElement.GetString()?.Trim()
                    : null;
                if (string.IsNullOrWhiteSpace(title))
                    continue;

                assignments.Add(new ScheduleAssignment(null, due!, title, estimate, checklist));
            }
        }

        var normalized = NormalizeAssignments(assignments, tasks);
        return new CoachProviderResult(message, EnrichWithTitles(normalized, tasks));
    }

    private static IReadOnlyList<ChecklistItem>? ParseChecklist(JsonElement item)
    {
        if (!item.TryGetProperty("checklist", out var checklistElement) ||
            checklistElement.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var items = new List<ChecklistItem>();
        foreach (var entry in checklistElement.EnumerateArray())
        {
            var title = entry.TryGetProperty("title", out var titleElement)
                ? titleElement.GetString()?.Trim()
                : null;
            if (string.IsNullOrWhiteSpace(title))
                continue;

            var done = entry.TryGetProperty("done", out var doneElement) &&
                       doneElement.ValueKind == JsonValueKind.True;

            items.Add(new ChecklistItem
            {
                Id = Guid.NewGuid().ToString("N"),
                Title = title,
                Done = done,
            });
        }

        return items.Count > 0 ? items : null;
    }

    public static string SerializeTasksForPrompt(IReadOnlyList<CoachTaskItem> tasks) =>
        JsonSerializer.Serialize(tasks.Select(task => new
        {
            id = task.Id,
            title = task.Title,
            due = task.Due,
            priority = task.Priority,
            estimateMinutes = task.EstimateMinutes,
        }));

    private static bool HistoryIndicatesPendingPlan(IReadOnlyList<CoachChatMessage>? history)
    {
        if (history is null || history.Count == 0)
            return false;

        var recent = history.TakeLast(4);
        foreach (var message in recent)
        {
            if (!string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase))
                continue;

            if (Regex.IsMatch(
                    message.Content,
                    @"\b(schedule|calendar|workout|plan|routine|apply|ready for you to apply|proposed)\b",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            {
                return true;
            }
        }

        return recent.Any(message =>
            string.Equals(message.Role, "user", StringComparison.OrdinalIgnoreCase) &&
            (ScheduleIntent.IsMatch(message.Content) || MultiDayPlanIntent.IsMatch(message.Content)));
    }

    private static ScheduleAssignment EnrichExisting(
        ScheduleAssignment assignment,
        IReadOnlyList<CoachTaskItem> tasks)
    {
        if (assignment.TaskId is not int taskId)
            return assignment;

        var title = tasks.FirstOrDefault(task => task.Id == taskId)?.Title;
        return assignment with { Title = title ?? assignment.Title };
    }

    private static bool IsValidDueDate(string? due) =>
        !string.IsNullOrWhiteSpace(due) && IsoDate.IsMatch(due);

    private static DateOnly NextWeekday(DateOnly date)
    {
        while (date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
            date = date.AddDays(1);
        return date;
    }
}
