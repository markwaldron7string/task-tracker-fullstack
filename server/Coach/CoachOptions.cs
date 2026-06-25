namespace TaskTracker.Coach;

public class CoachOptions
{
    /// <summary>Auto (default), OpenAI, or Stub.</summary>
    public string Provider { get; set; } = "Auto";

    public string? ApiKey { get; set; }

    public string Model { get; set; } = "gpt-4o-mini";

    public string Endpoint { get; set; } = "https://api.openai.com/v1/chat/completions";

    public int MaxTokens { get; set; } = 320;

    public int ScheduleMaxTokens { get; set; } = 8000;
}
