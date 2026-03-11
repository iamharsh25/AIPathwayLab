using AIPathwayLab.Api.Infrastructure;
using AIPathwayLab.Api.AI;
using AIPathwayLab.Api.Services;
using Microsoft.SemanticKernel;

var builder = WebApplication.CreateBuilder(args);

// ---------------- CORS ----------------

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy =>
        {
            policy
                .WithOrigins("http://localhost:3000")
                .AllowAnyHeader()
                .AllowAnyMethod();
        });
});

// ---------------- Core Services ----------------

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ---------------- Application Services ----------------

builder.Services.AddSingleton<SessionStore>();
builder.Services.AddSingleton<PromptService>();
builder.Services.AddSingleton<VectorStore>();
builder.Services.AddSingleton<ChunkingService>();
builder.Services.AddSingleton<RagService>();
builder.Services.AddSingleton<RerankerService>();
builder.Services.AddSingleton<SemanticCacheService>();
builder.Services.AddSingleton<TutorOrchestrator>();
builder.Services.AddSingleton<AIObservabilityService>();
builder.Services.AddSingleton<CodeIndexer>();
builder.Services.AddSingleton<VisionService>();
builder.Services.AddSingleton<RagPlaygroundService>();

// ---------------- Semantic Kernel ----------------

builder.Services.AddSingleton<Kernel>(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    return KernelFactory.CreateKernel(config);
});

var app = builder.Build();

// ---------------- Middleware ----------------

app.UseCors("AllowFrontend");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

// ---------------- RAG Indexing ----------------

// Resolve services
var ragService = app.Services.GetRequiredService<RagService>();
var codeIndexer = app.Services.GetRequiredService<CodeIndexer>();

// Fix root path (because runtime starts in /bin)
var projectRoot = Path.GetFullPath(
    Path.Combine(Directory.GetCurrentDirectory(), "../../../")
);

// ---------- Load Knowledge Documents ----------

var knowledgePath = Path.Combine(projectRoot, "Knowledge");

if (Directory.Exists(knowledgePath))
{
    var files = Directory.GetFiles(knowledgePath, "*.txt");

    foreach (var file in files)
    {
        var content = await File.ReadAllTextAsync(file);
        await ragService.AddDocumentAsync(content);
    }
}

// ---------- Load Codebase ----------

var codeChunks = codeIndexer.LoadCodeFiles(projectRoot);

Console.WriteLine($"Indexing {codeChunks.Count} code chunks");

foreach (var chunk in codeChunks)
{
    await ragService.AddDocumentAsync(chunk);
}

// ---------------- Start App ----------------

app.Run();