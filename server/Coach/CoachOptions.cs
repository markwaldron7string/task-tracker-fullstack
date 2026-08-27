namespace TaskTracker.Coach;

public class CoachOptions
{
    /// <summary>Auto (default), OpenAI, or Stub.</summary>
    public string Provider { get; set; } = "Auto";

    public string? ApiKey { get; set; }

    public string Model { get; set; } = CoachLlmSettings.GeminiModel;

    public string Endpoint { get; set; } = CoachLlmSettings.GeminiEndpoint;

    public int MaxTokens { get; set; } = 600;

    public int ScheduleMaxTokens { get; set; } = 8000;
}
