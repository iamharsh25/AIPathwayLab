namespace AIPathwayLab.Api.Services;

public class ChunkingService
{
    public List<string> ChunkText(string text, int chunkSize = 300, int overlap = 50)
    {
        var chunks = new List<string>();

        for (int i = 0; i < text.Length; i += chunkSize - overlap)
        {
            var length = Math.Min(chunkSize, text.Length - i);

            chunks.Add(text.Substring(i, length));
        }

        return chunks;
    }
}