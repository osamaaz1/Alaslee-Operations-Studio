using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.ServiceProcess;
using System.Text;

namespace AlasleeOperationsStudio.WindowsService
{
    internal static class Program
    {
        private static void Main()
        {
            ServiceBase.Run(new ServiceBase[] { new AlasleeService() });
        }
    }

    internal sealed class AlasleeService : ServiceBase
    {
        private readonly object logLock = new object();
        private readonly object processLock = new object();
        private volatile bool stopping;
        private Process child;
        private ServiceConfiguration configuration;

        internal AlasleeService()
        {
            ServiceName = "AlasleeOperationsStudio";
            CanStop = true;
            CanShutdown = true;
            AutoLog = false;
        }

        protected override void OnStart(string[] args)
        {
            stopping = false;
            configuration = ServiceConfiguration.Load(
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "service.conf")
            );
            PruneOldLogs();
            WriteLog("[service] starting Alaslee Operations Studio");
            try { StartNode(); }
            catch (Exception error)
            {
                WriteLog("[service] Node.js startup failed: " + error.Message, true);
                throw;
            }
        }

        protected override void OnStop()
        {
            TryRequestAdditionalTime();
            StopNode("service stop");
        }

        protected override void OnShutdown()
        {
            TryRequestAdditionalTime();
            StopNode("Windows shutdown");
            base.OnShutdown();
        }

        private void StartNode()
        {
            Process process = new Process();
            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = configuration.NodePath,
                Arguments = QuoteArgument(configuration.ServerEntryPoint),
                WorkingDirectory = configuration.ProjectRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            startInfo.EnvironmentVariables["ENV_FILE"] = configuration.EnvironmentFile;
            startInfo.EnvironmentVariables["NODE_ENV"] = "production";
            startInfo.EnvironmentVariables["HOST"] = configuration.Host;
            startInfo.EnvironmentVariables["ALASLEE_SERVICE_PIPE"] = configuration.PipeName;
            startInfo.EnvironmentVariables["ALASLEE_SERVICE_TOKEN"] = configuration.ShutdownToken;

            process.StartInfo = startInfo;
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                if (eventArgs.Data != null) WriteLog(eventArgs.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                if (eventArgs.Data != null) WriteLog(eventArgs.Data, true);
            };
            process.Exited += ChildExited;

            lock (processLock) child = process;
            try
            {
                if (!process.Start()) throw new InvalidOperationException("Node.js did not start.");
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                WriteLog("[service] Node.js started with process ID " + process.Id.ToString(CultureInfo.InvariantCulture));
            }
            catch
            {
                lock (processLock) child = null;
                process.Dispose();
                throw;
            }
        }

        private void ChildExited(object sender, EventArgs eventArgs)
        {
            Process process = (Process)sender;
            int code = 1;
            try { code = process.ExitCode; } catch { }
            WriteLog("[service] Node.js exited with code " + code.ToString(CultureInfo.InvariantCulture), code != 0);
            if (stopping) return;

            // Exiting the service process lets the Windows Service Control Manager
            // apply the configured lightweight restart policy.
            ExitCode = 1066;
            Environment.Exit(code == 0 ? 1 : code);
        }

        private void StopNode(string reason)
        {
            stopping = true;
            Process process;
            lock (processLock) process = child;
            if (process == null) return;

            try
            {
                if (!process.HasExited)
                {
                    bool requested = RequestGracefulShutdown();
                    WriteLog(requested
                        ? "[service] requested graceful Node.js shutdown for " + reason
                        : "[service] graceful channel unavailable; waiting before fallback termination", !requested);
                    if (!process.WaitForExit(25000))
                    {
                        WriteLog("[service] graceful shutdown timed out; terminating Node.js as a last resort", true);
                        process.Kill();
                        process.WaitForExit(5000);
                    }
                    try { process.WaitForExit(); } catch { }
                }
            }
            finally
            {
                lock (processLock) child = null;
                process.Dispose();
                WriteLog("[service] stopped after " + reason);
            }
        }

        private bool RequestGracefulShutdown()
        {
            try
            {
                using (NamedPipeClientStream pipe = new NamedPipeClientStream(
                    ".", configuration.PipeName, PipeDirection.InOut, PipeOptions.None))
                {
                    pipe.Connect(5000);
                    byte[] request = new UTF8Encoding(false).GetBytes(configuration.ShutdownToken + "\n");
                    pipe.Write(request, 0, request.Length);
                    pipe.Flush();
                    return true;
                }
            }
            catch (Exception error)
            {
                WriteLog("[service] graceful shutdown request failed: " + error.Message, true);
                return false;
            }
        }

        private void TryRequestAdditionalTime()
        {
            try { RequestAdditionalTime(30000); } catch { }
        }

        private void PruneOldLogs()
        {
            try
            {
                Directory.CreateDirectory(configuration.LogDirectory);
                DateTime cutoff = DateTime.Now.AddDays(-configuration.LogRetentionDays);
                foreach (string path in Directory.GetFiles(configuration.LogDirectory, "server-service-*.log"))
                {
                    if (File.GetLastWriteTime(path) < cutoff) File.Delete(path);
                }
            }
            catch (Exception error)
            {
                WriteLog("[service] old log cleanup failed: " + error.Message, true);
            }
        }

        private void WriteLog(string message, bool error = false)
        {
            if (configuration == null) return;
            try
            {
                Directory.CreateDirectory(configuration.LogDirectory);
                string suffix = error ? ".error.log" : ".log";
                string filename = "server-service-" + DateTime.Now.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + suffix;
                string line = DateTimeOffset.Now.ToString("o", CultureInfo.InvariantCulture) + " " + message + Environment.NewLine;
                lock (logLock)
                {
                    File.AppendAllText(Path.Combine(configuration.LogDirectory, filename), line, new UTF8Encoding(false));
                }
            }
            catch
            {
                // Logging must never prevent service shutdown.
            }
        }

        private static string QuoteArgument(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }
    }

    internal sealed class ServiceConfiguration
    {
        internal string ProjectRoot { get; private set; }
        internal string EnvironmentFile { get; private set; }
        internal string NodePath { get; private set; }
        internal string ServerEntryPoint { get; private set; }
        internal string LogDirectory { get; private set; }
        internal string Host { get; private set; }
        internal string PipeName { get; private set; }
        internal string ShutdownToken { get; private set; }
        internal int LogRetentionDays { get; private set; }

        internal static ServiceConfiguration Load(string path)
        {
            if (!File.Exists(path)) throw new FileNotFoundException("The Alaslee service configuration was not found.", path);
            Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string rawLine in File.ReadAllLines(path, Encoding.UTF8))
            {
                string line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal)) continue;
                int separator = line.IndexOf('=');
                if (separator <= 0) throw new InvalidDataException("The Alaslee service configuration contains an invalid line.");
                string key = line.Substring(0, separator).Trim();
                string encoded = line.Substring(separator + 1).Trim();
                values[key] = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
            }

            int retention;
            if (!Int32.TryParse(Require(values, "LogRetentionDays"), NumberStyles.None, CultureInfo.InvariantCulture, out retention)
                || retention < 1 || retention > 365)
            {
                throw new InvalidDataException("LogRetentionDays must be between 1 and 365.");
            }

            ServiceConfiguration result = new ServiceConfiguration
            {
                ProjectRoot = Require(values, "ProjectRoot"),
                EnvironmentFile = Require(values, "EnvironmentFile"),
                NodePath = Require(values, "NodePath"),
                ServerEntryPoint = Require(values, "ServerEntryPoint"),
                LogDirectory = Require(values, "LogDirectory"),
                Host = Require(values, "Host"),
                PipeName = Require(values, "PipeName"),
                ShutdownToken = Require(values, "ShutdownToken"),
                LogRetentionDays = retention
            };
            result.Validate();
            return result;
        }

        private void Validate()
        {
            if (!Directory.Exists(ProjectRoot)) throw new DirectoryNotFoundException("The Alaslee project directory does not exist.");
            if (!File.Exists(EnvironmentFile)) throw new FileNotFoundException("The Alaslee environment file does not exist.", EnvironmentFile);
            if (!File.Exists(NodePath)) throw new FileNotFoundException("Node.js does not exist at the configured path.", NodePath);
            if (!File.Exists(ServerEntryPoint)) throw new FileNotFoundException("The Alaslee server entry point does not exist.", ServerEntryPoint);
            if (ShutdownToken.Length < 32) throw new InvalidDataException("The service shutdown token is too short.");
            foreach (char character in PipeName)
            {
                if (!(Char.IsLetterOrDigit(character) || character == '.' || character == '_' || character == '-'))
                    throw new InvalidDataException("The service pipe name contains unsupported characters.");
            }
            if (PipeName.Length == 0 || PipeName.Length > 128) throw new InvalidDataException("The service pipe name is invalid.");
        }

        private static string Require(Dictionary<string, string> values, string key)
        {
            string value;
            if (!values.TryGetValue(key, out value) || String.IsNullOrWhiteSpace(value))
                throw new InvalidDataException("The Alaslee service setting is missing: " + key);
            return value;
        }
    }
}
