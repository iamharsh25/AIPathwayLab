using Microsoft.SemanticKernel;

namespace AIPathwayLab.Api.AI;

public static class KernelFactory
{
    public static Kernel CreateKernel(IConfiguration configuration)
    {
        var builder = Kernel.CreateBuilder();

        var endpoint = configuration["AzureOpenAI:Endpoint"];
        var apiKey = configuration["AzureOpenAI:ApiKey"];
        var deployment = configuration["AzureOpenAI:DeploymentName"];
        var embeddingDeployment = configuration["AzureOpenAI:EmbeddingDeployment"];

        // Chat model
        builder.AddAzureOpenAIChatCompletion(
            deploymentName: deployment!,
            endpoint: endpoint!,
            apiKey: apiKey!
        );

        // Embedding model
        builder.AddAzureOpenAITextEmbeddingGeneration(
            deploymentName: embeddingDeployment!,
            endpoint: endpoint!,
            apiKey: apiKey!
        );

        return builder.Build();
    }
}