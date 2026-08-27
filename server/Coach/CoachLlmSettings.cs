namespace TaskTracker.Coach;

/// <summary>Resolves Gemini by default (free), with Groq and OpenAI as opt-in presets.</summary>
public static class CoachLlmSettings
{
    public const string GeminiEndpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    public const string GeminiModel = "gemini-2.5-flash";
    public const string GroqEndpoint = "https://api.groq.com/openai/v1/chat/completions";
    public const string GroqModel = "llama-3.3-70b-versatile";
    public const string OpenAiEndpoint = "https://api.openai.com/v1/chat/completions";
    public const string OpenAiModel = "gpt-4o-mini";

    public sealed record Resolved(bool UseStub, string Kind, string Model, string Endpoint, bool DisableThinking);

    public static Resolved Resolve(CoachOptions options)
    {
        var requested = (options.Provider ?? "auto").Trim().ToLowerInvariant();
        var key = options.ApiKey?.Trim();
        var inferred = InferKindFromKey(key);

        if (requested is "stub" || string.IsNullOrWhiteSpace(key))
            return new Resolved(true, "stub", GeminiModel, GeminiEndpoint, false);

        var kind = requested is "auto" or ""
            ? inferred ?? "gemini"
            : inferred ?? requested;

        return kind switch
        {
            "groq" => new Resolved(false, "groq", ResolveModel(options.Model, "groq"), ResolveEndpoint(options.Endpoint, GroqEndpoint), false),
            "openai" => new Resolved(false, "openai", ResolveModel(options.Model, "openai"), ResolveEndpoint(options.Endpoint, OpenAiEndpoint), false),
            _ => Gemini(options),
        };
    }

    public static string? InferKindFromKey(string? apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
            return null;
        if (apiKey.StartsWith("AIza", StringComparison.Ordinal))
            return "gemini";
        if (apiKey.StartsWith("gsk_", StringComparison.Ordinal))
            return "groq";
        if (apiKey.StartsWith("sk-", StringComparison.Ordinal))
            return "openai";
        return null;
    }

    private static Resolved Gemini(CoachOptions options)
    {
        var model = ResolveModel(options.Model, "gemini");
        return new Resolved(
            false,
            "gemini",
            model,
            ResolveEndpoint(options.Endpoint, GeminiEndpoint),
            model.Contains("gemini-2.5", StringComparison.OrdinalIgnoreCase));
    }

    private static string ResolveModel(string configured, string kind)
    {
        if (!string.IsNullOrWhiteSpace(configured) && !IsKnownDefaultModel(configured))
            return configured.Trim();

        return kind switch
        {
            "groq" => GroqModel,
            "openai" => OpenAiModel,
            _ => GeminiModel,
        };
    }

    private static string ResolveEndpoint(string configured, string preset)
    {
        if (string.IsNullOrWhiteSpace(configured) || IsKnownEndpoint(configured))
            return preset;
        return configured.Trim();
    }

    private static bool IsKnownDefaultModel(string model)
    {
        var trimmed = model.Trim();
        return trimmed.Equals(OpenAiModel, StringComparison.OrdinalIgnoreCase)
            || trimmed.Equals(GeminiModel, StringComparison.OrdinalIgnoreCase)
            || trimmed.Equals(GroqModel, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsKnownEndpoint(string endpoint) =>
        endpoint.Contains("api.openai.com", StringComparison.OrdinalIgnoreCase)
        || endpoint.Contains("generativelanguage.googleapis.com", StringComparison.OrdinalIgnoreCase)
        || endpoint.Contains("api.groq.com", StringComparison.OrdinalIgnoreCase);
}
