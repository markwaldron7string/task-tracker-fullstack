using System.Text.Json;
using System.Text.Json.Serialization;

namespace TaskTracker;

public class ChecklistItem
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public bool Done { get; set; }
}

public static class ChecklistHelper
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static List<ChecklistItem> Deserialize(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<ChecklistItem>>(json, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    public static string Serialize(IEnumerable<ChecklistItem> items) =>
        JsonSerializer.Serialize(Normalize(items), JsonOptions);

    public static List<ChecklistItem> Normalize(IEnumerable<ChecklistItem>? items)
    {
        if (items is null)
            return [];

        return items
            .Where(item => !string.IsNullOrWhiteSpace(item.Title))
            .Select(item => new ChecklistItem
            {
                Id = string.IsNullOrWhiteSpace(item.Id) ? Guid.NewGuid().ToString("N") : item.Id.Trim(),
                Title = item.Title.Trim(),
                Done = item.Done,
            })
            .ToList();
    }
}
