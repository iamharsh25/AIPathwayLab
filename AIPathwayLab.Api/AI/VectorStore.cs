namespace AIPathwayLab.Api.AI;

public class VectorStore
{
    public List<(string Text, ReadOnlyMemory<float> Vector)> Documents { get; } = new();
}