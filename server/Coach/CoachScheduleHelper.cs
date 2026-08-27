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

    private static readonly Regex CreatePlanIntent = new(
        @"\b(make|create|build|generate|design|draft|give\s+me)\b.{0,48}\b(plan|schedule|routine|program|something)\b",
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

    private static readonly Regex AdjustmentIntent = new(
        @"\b(lighter|lighten|heavier|easier|harder|change|swap|remove|add|rest|shorten|longer|adjust|modify|update|instead|fewer|more|skip|spread|move|push|shift)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex IsoDate = new(@"^\d{4}-\d{2}-\d{2}$");

    public const int MaxAssignments = 31;

    public static bool ShouldUseScheduleMode(
        string question,
        IReadOnlyList<CoachChatMessage>? history,
        IReadOnlyList<ScheduleAssignment>? currentSchedule,
        bool reviseSchedule = false)
    {
        if (reviseSchedule && currentSchedule is { Count: > 0 })
            return true;

        if (IsScheduleRequest(question, history))
            return true;

        return currentSchedule is { Count: > 0 } &&
               AdjustmentIntent.IsMatch(question);
    }

    public static bool IsScheduleRequest(string question, IReadOnlyList<CoachChatMessage>? history)
    {
        var trimmed = question.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return false;

        if (IsVagueRequestCore(trimmed))
            return false;

        if (CreatePlanIntent.IsMatch(trimmed) || ScheduleIntent.IsMatch(trimmed) || MultiDayPlanIntent.IsMatch(trimmed))
            return true;

        return ConfirmationIntent.IsMatch(trimmed) && HistoryIndicatesPendingPlan(history);
    }

    public static bool IsAwaitingReply(string text) =>
        !string.IsNullOrWhiteSpace(text) && text.TrimEnd().EndsWith('?');

    public static bool IsVagueRequest(string question, IReadOnlyList<CoachChatMessage>? history) =>
        IsVagueRequestCore(question);

    private static bool IsVagueRequestCore(string question)
    {
        var trimmed = question.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return false;

        if (ConfirmationIntent.IsMatch(trimmed))
            return false;

        if (CreatePlanIntent.IsMatch(trimmed) ||
            ScheduleIntent.IsMatch(trimmed) ||
            MultiDayPlanIntent.IsMatch(trimmed))
        {
            return false;
        }

        var lower = trimmed.ToLowerInvariant();

        if (Regex.IsMatch(lower, @"overdue|today|focus|overcommit|capacity|priority|tomorrow"))
            return false;

        if (Regex.IsMatch(trimmed, @"^(help(\s+me)?|hi|hey|hello|what|huh)\.?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return true;

        var words = trimmed.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (words.Length <= 2 && !Regex.IsMatch(trimmed, @"\d"))
            return true;

        return false;
    }

    public static string BuildClarifyingQuestion(string question)
    {
        var lower = question.Trim().ToLowerInvariant();

        if (Regex.IsMatch(lower, @"health|wellness|better|feel|mind"))
        {
            return "Are you thinking about mental wellness, physical fitness, or something else — and how many days should the plan run?";
        }

        if (Regex.IsMatch(lower, @"plan|schedule"))
        {
            return "Happy to help — should I schedule your existing tasks, or create a new multi-day plan (workout, wellness, habits)? How many days?";
        }

        return "What would be most helpful right now — focus for today, a multi-day plan, or help placing tasks on your calendar?";
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

        var wellness = BuildStubWellnessPlan(planQuestion);
        if (wellness.Count > 0)
            return wellness;

        var reschedule = BuildStubReschedule(tasks);
        if (reschedule.Count > 0)
            return reschedule;

        return BuildStubGenericPlan(planQuestion);
    }

    public static IReadOnlyList<ScheduleAssignment> BuildStubGenericPlan(string question)
    {
        var days = ResolvePlanDays(question);
        var themes = new[]
        {
            "Clarify the top 3 priorities",
            "Deep work block",
            "Admin and follow-ups",
            "Learn or practice",
            "Move one stuck item forward",
            "Review progress",
            "Plan the next stretch",
        };

        var assignments = new List<ScheduleAssignment>();
        var day = DateOnly.FromDateTime(DateTime.Now);

        for (var index = 0; index < days; index++)
        {
            if (index > 0)
                day = NextWeekday(day.AddDays(1));
            else
                day = NextWeekday(day);

            var theme = themes[index % themes.Length];
            assignments.Add(new ScheduleAssignment(
                null,
                day.ToString("yyyy-MM-dd"),
                $"Day {index + 1} – {theme}",
                45,
                new List<ChecklistItem>
                {
                    MakeChecklistItem("Pick one outcome for the day"),
                    MakeChecklistItem("Work a 25–45 min focus block"),
                    MakeChecklistItem("Write down what's blocking you"),
                    MakeChecklistItem("Park leftovers for tomorrow"),
                }));
        }

        return assignments;
    }

    public static int ResolvePlanDays(string question)
    {
        var match = Regex.Match(question, @"(\d+)\s*day", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (match.Success && int.TryParse(match.Groups[1].Value, out var parsed))
            return Math.Clamp(parsed, 3, MaxAssignments);

        if (Regex.IsMatch(question, @"\bmonth\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return 20;

        if (Regex.IsMatch(question, @"\b(this\s+week|next\s+week|week)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return 5;

        return 7;
    }

    public static string ResolvePlanQuestionPublic(string question, IReadOnlyList<CoachChatMessage>? history) =>
        ResolvePlanQuestion(question, history);

    private static IReadOnlyList<ScheduleAssignment> BuildStubWellnessPlan(string question)
    {
        if (!Regex.IsMatch(question, @"mental health|wellness|mindfulness|well-being|wellbeing", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return Array.Empty<ScheduleAssignment>();

        var days = ResolvePlanDays(question);

        var themes = new[]
        {
            "Morning Mindfulness",
            "Nature Walk",
            "Gratitude & Journaling",
            "Gentle Movement",
            "Social Connection",
            "Creative Expression",
            "Rest & Recovery",
        };

        var assignments = new List<ScheduleAssignment>();
        var day = DateOnly.FromDateTime(DateTime.Now);

        for (var index = 0; index < days; index++)
        {
            if (index > 0)
                day = NextWeekday(day.AddDays(1));
            else
                day = NextWeekday(day);

            var theme = themes[index % themes.Length];
            assignments.Add(new ScheduleAssignment(
                null,
                day.ToString("yyyy-MM-dd"),
                $"Day {index + 1} – {theme}",
                30,
                new List<ChecklistItem>
                {
                    MakeChecklistItem("5 min breathing exercise"),
                    MakeChecklistItem("10 min mindful walk outside"),
                    MakeChecklistItem("Write 3 things you're grateful for"),
                    MakeChecklistItem("Evening check-in: rate mood 1–5"),
                }));
        }

        return assignments;
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
        if (!Regex.IsMatch(question, @"workout|training|exercise|habit|routine", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return Array.Empty<ScheduleAssignment>();

        var days = ResolvePlanDays(question);

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
                if (!string.Equals(message.Role, "user", StringComparison.OrdinalIgnoreCase))
                    continue;

                if (IsVagueRequestCore(message.Content))
                    continue;

                if (MultiDayPlanIntent.IsMatch(message.Content) || ScheduleIntent.IsMatch(message.Content) || CreatePlanIntent.IsMatch(message.Content))
                    return message.Content;
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

    public static string ExtractJsonObject(string content)
    {
        var trimmed = content.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return trimmed;

        if (trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            var fenceStart = trimmed.IndexOf('{');
            var fenceEnd = trimmed.LastIndexOf('}');
            if (fenceStart >= 0 && fenceEnd > fenceStart)
                return trimmed[fenceStart..(fenceEnd + 1)];
        }

        if (trimmed.StartsWith('{'))
            return trimmed;

        var start = trimmed.IndexOf('{');
        var end = trimmed.LastIndexOf('}');
        if (start >= 0 && end > start)
            return trimmed[start..(end + 1)];

        return trimmed;
    }

    public static CoachProviderResult ParseStructuredResponse(
        string json,
        IReadOnlyList<CoachTaskItem> tasks,
        IReadOnlyList<ScheduleAssignment>? currentSchedule = null)
    {
        using var document = JsonDocument.Parse(ExtractJsonObject(json));
        var root = document.RootElement;

        var message = root.TryGetProperty("message", out var messageElement)
            ? messageElement.GetString()?.Trim()
            : null;
        if (string.IsNullOrWhiteSpace(message))
            message = "Here's a proposed schedule you can apply to your calendar.";

        var overview = root.TryGetProperty("overview", out var overviewElement)
            ? overviewElement.GetString()?.Trim()
            : null;

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
        var enriched = EnrichWithTitles(normalized, tasks);
        if (string.IsNullOrWhiteSpace(overview))
            overview = BuildStubOverview(enriched, string.Join(' ', enriched.Select(a => a.Title ?? "")));

        return new CoachProviderResult(message, enriched, overview);
    }

    public static string BuildStubOverview(IReadOnlyList<ScheduleAssignment> schedule, string question)
    {
        if (schedule.Count == 0)
            return string.Empty;

        var days = schedule.Count;
        var lower = question.ToLowerInvariant();

        if (Regex.IsMatch(lower, @"mental health|wellness|mindfulness|well-being|wellbeing"))
        {
            return $"""
                This {days}-day mental health plan balances mindfulness, gentle movement, and reflective habits. Each day builds on the last with small, achievable steps — morning grounding, mindful activity, and evening wind-down — so you can support your well-being without overwhelming your calendar.

                Review the daily tasks below, tap Overview anytime for this summary, and ask me to adjust anything before you apply the plan.
                """;
        }

        if (Regex.IsMatch(lower, @"workout|training|exercise|habit|routine"))
        {
            return $"""
                This {days}-day plan mixes training sessions, active recovery, and optional nutrition checkpoints. Workouts progress through different muscle groups and energy systems while keeping daily time blocks realistic.

                Use the checklist on each day to track warm-ups, main work, and meals. Tell me if you want it lighter, shorter, or focused on a different goal before applying.
                """;
        }

        return $"""
            This plan spreads {days} calendar task{(days == 1 ? "" : "s")} across upcoming days based on your request. Each entry includes a due date and optional checklist steps so you can see exactly what to do when.

            Ask me to lighten specific days, swap tasks, or change the focus before you tap Apply to calendar.
            """;
    }

    public static IReadOnlyList<ScheduleAssignment> ReviseStubSchedule(
        string question,
        IReadOnlyList<ScheduleAssignment> currentSchedule)
    {
        var lower = question.ToLowerInvariant();
        var revised = currentSchedule.ToList();

        if (Regex.IsMatch(lower, @"\b(rest|lighter|lighten|easier|fewer)\b"))
        {
            revised = revised
                .Select((assignment, index) => index % 2 == 1 && Regex.IsMatch(lower, @"rest|lighter|lighten|easier")
                    ? assignment with
                    {
                        Title = $"Rest day – {assignment.Title}",
                        EstimateMinutes = 20,
                        Checklist = new List<ChecklistItem>
                        {
                            MakeChecklistItem("20 min easy walk"),
                            MakeChecklistItem("10 min stretching"),
                            MakeChecklistItem("Journal: one thing you're grateful for"),
                        }
                    }
                    : assignment)
                .ToList();
        }

        if (Regex.IsMatch(lower, @"\b(shorten|shorter|less time|quick)\b"))
        {
            revised = revised
                .Select(assignment => assignment with
                {
                    EstimateMinutes = assignment.EstimateMinutes is int minutes
                        ? Math.Max(15, minutes - 15)
                        : 20,
                    Checklist = assignment.Checklist?.Take(Math.Max(2, (assignment.Checklist.Count + 1) / 2)).ToList()
                })
                .ToList();
        }

        if (Regex.IsMatch(lower, @"\b(remove|drop|skip)\b.*\b(day|week)\b"))
        {
            revised = revised.Take(Math.Max(1, revised.Count - 1)).ToList();
        }

        return revised;
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

            if (IsAwaitingReply(message.Content))
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
            !IsVagueRequestCore(message.Content) &&
            (ScheduleIntent.IsMatch(message.Content) || MultiDayPlanIntent.IsMatch(message.Content) || CreatePlanIntent.IsMatch(message.Content)));
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
