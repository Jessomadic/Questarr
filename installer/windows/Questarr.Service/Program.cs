using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

await Host.CreateDefaultBuilder(args)
    .UseWindowsService(options => { options.ServiceName = "Questarr"; })
    .ConfigureServices(services => { services.AddHostedService<QuestarrWorker>(); })
    .Build()
    .RunAsync();

internal sealed class QuestarrWorker : BackgroundService
{
    private readonly ILogger<QuestarrWorker> logger;
    private Process? questarrProcess;

    public QuestarrWorker(ILogger<QuestarrWorker> logger)
    {
        this.logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var installDir = AppContext.BaseDirectory;
        var programDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Questarr"
        );
        var dataDir = Path.Combine(programDataDir, "data");
        var logsDir = Path.Combine(programDataDir, "logs");
        var logPath = Path.Combine(logsDir, "questarr.log");
        var configPath = Path.Combine(programDataDir, "config.env");

        Directory.CreateDirectory(dataDir);
        Directory.CreateDirectory(logsDir);
        var configValues = ReadConfigFile(configPath);

        var nodeExe = Path.Combine(installDir, "bin", "node.exe");
        if (!File.Exists(nodeExe))
        {
            nodeExe = "node";
        }

        var serverScript = Path.Combine(installDir, "dist", "server", "index.js");
        if (!File.Exists(serverScript))
        {
            throw new FileNotFoundException("Questarr server entrypoint was not found.", serverScript);
        }

        var processStartInfo = new ProcessStartInfo
        {
            FileName = nodeExe,
            WorkingDirectory = installDir,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        processStartInfo.ArgumentList.Add(serverScript);
        foreach (var (key, value) in configValues)
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key)))
            {
                processStartInfo.Environment[key] = value;
            }
        }

        processStartInfo.Environment["NODE_ENV"] = "production";
        processStartInfo.Environment["PORT"] = GetEnvironmentValue("PORT", configValues, "5000");
        processStartInfo.Environment["QUESTARR_DATA_DIR"] = GetEnvironmentValue(
            "QUESTARR_DATA_DIR",
            configValues,
            dataDir
        );
        processStartInfo.Environment["SQLITE_DB_PATH"] = GetEnvironmentValue(
            "SQLITE_DB_PATH",
            configValues,
            Path.Combine(dataDir, "sqlite.db")
        );

        await using var logStream = new FileStream(
            logPath,
            FileMode.Append,
            FileAccess.Write,
            FileShare.ReadWrite
        );
        await using var logWriter = new StreamWriter(logStream) { AutoFlush = true };

        questarrProcess = new Process
        {
            StartInfo = processStartInfo,
            EnableRaisingEvents = true,
        };

        questarrProcess.OutputDataReceived += (_, eventArgs) => WriteProcessLog(logWriter, eventArgs.Data);
        questarrProcess.ErrorDataReceived += (_, eventArgs) => WriteProcessLog(logWriter, eventArgs.Data);

        logger.LogInformation("Starting Questarr from {InstallDir}", installDir);
        questarrProcess.Start();
        questarrProcess.BeginOutputReadLine();
        questarrProcess.BeginErrorReadLine();

        try
        {
            await questarrProcess.WaitForExitAsync(stoppingToken);
            if (!stoppingToken.IsCancellationRequested && questarrProcess.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    $"Questarr exited unexpectedly with code {questarrProcess.ExitCode}."
                );
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            StopQuestarrProcess();
        }
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        StopQuestarrProcess();
        return base.StopAsync(cancellationToken);
    }

    private static string GetEnvironmentValue(
        string name,
        IReadOnlyDictionary<string, string> configValues,
        string fallback
    )
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(value) && configValues.TryGetValue(name, out var configValue))
        {
            value = configValue;
        }

        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private static IReadOnlyDictionary<string, string> ReadConfigFile(string path)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(path))
        {
            return values;
        }

        foreach (var rawLine in File.ReadAllLines(path))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
            {
                continue;
            }

            var separatorIndex = line.IndexOf('=');
            if (separatorIndex <= 0)
            {
                continue;
            }

            var key = line[..separatorIndex].Trim();
            var value = line[(separatorIndex + 1)..].Trim().Trim('"');
            if (key.Length > 0)
            {
                values[key] = value;
            }
        }

        return values;
    }

    private static void WriteProcessLog(TextWriter writer, string? line)
    {
        if (line is null)
        {
            return;
        }

        lock (writer)
        {
            writer.WriteLine(line);
        }
    }

    private void StopQuestarrProcess()
    {
        if (questarrProcess is null || questarrProcess.HasExited)
        {
            return;
        }

        try
        {
            logger.LogInformation("Stopping Questarr process");
            questarrProcess.Kill(entireProcessTree: true);
            questarrProcess.WaitForExit(30000);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to stop Questarr cleanly");
        }
    }
}
