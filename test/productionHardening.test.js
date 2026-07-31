import test from "node:test";
import assert from "node:assert/strict";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("production startup rebuilds the client before serving it", () => {
  const startup = fsSync.readFileSync("scripts/start-production.ps1", "utf8");
  const build = startup.indexOf("npm.cmd run build");
  const server = startup.indexOf("Start-Process -FilePath node.exe");

  assert.notEqual(build, -1);
  assert.equal(build < server, true);
});

test("interactive production startup replaces prior sessions and opens the healthy server", () => {
  const startup = fsSync.readFileSync("scripts/start-production.ps1", "utf8");
  const launch = startup.indexOf("$serverProcess = Start-Process -FilePath node.exe");
  const healthWait = startup.indexOf("Wait-ForProductionServer -Process $serverProcess");
  const browser = startup.indexOf("Start-Process -FilePath $browserUrl");

  assert.match(startup, /Get-CimInstance Win32_Process[\s\S]+Name = 'node\.exe'/);
  assert.match(startup, /Stop-Service -Name \$productionServiceName/);
  assert.match(startup, /Stop-ScheduledTask -TaskName \$productionTaskName/);
  assert.match(startup, /if \(\$CleanupOnly\)[\s\S]+return/);
  assert.match(startup, /Stop-PreviousProductionSessions -ServerEntryPoint \$serverEntryPoint -Port \$port/);
  assert.notEqual(launch, -1);
  assert.equal(launch < healthWait, true);
  assert.equal(healthWait < browser, true);
  assert.match(startup, /-not \$NoBrowser -and -not \$isSystemSession/);
  assert.match(startup, /\$values\.ContainsKey\('PORT'\)[\s\S]+else \{ '3000' \}/);
  assert.doesNotMatch(startup, /\$values\.(?:PORT|HOST)/);
});

test("production startup refreshes an expired Daftra cache before preflight", () => {
  for (const scriptPath of ["scripts/start-production.ps1", "scripts/install-production-windows.ps1"]) {
    const script = fsSync.readFileSync(scriptPath, "utf8");
    const refresh = script.indexOf("npm.cmd run daftra:ensure-ready");
    const preflight = script.indexOf("npm.cmd run production:preflight");
    assert.notEqual(refresh, -1, scriptPath);
    assert.notEqual(preflight, -1, scriptPath);
    assert.equal(refresh < preflight, true, scriptPath);
  }
});

test("Windows production uses a silent, recoverable service with graceful shutdown", () => {
  const installer = fsSync.readFileSync("scripts/install-production-windows.ps1", "utf8");
  const serviceHost = fsSync.readFileSync("scripts/windows-service/AlasleeService.cs", "utf8");
  const server = fsSync.readFileSync("src/server.js", "utf8");
  const scheduler = fsSync.readFileSync("src/jobs/daftraScheduler.js", "utf8");

  assert.match(installer, /New-Service[\s\S]+StartupType Automatic/);
  assert.match(installer, /failure[\s\S]+restart\/60000/);
  assert.match(installer, /Unregister-ScheduledTask/);
  assert.doesNotMatch(installer, /Register-ScheduledTask/);
  assert.match(serviceHost, /CanShutdown = true/);
  assert.match(serviceHost, /NamedPipeClientStream/);
  assert.match(serviceHost, /CreateNoWindow = true/);
  assert.match(serviceHost, /RedirectStandardOutput = true/);
  assert.doesNotMatch(serviceHost, /powershell|cmd\.exe/i);
  assert.match(server, /ALASLEE_SERVICE_PIPE/);
  assert.match(server, /closeHttpServer\(server\)/);
  assert.match(server, /closeCrmPool\(\)/);
  assert.match(server, /closeDatabase\(\)/);
  assert.match(server, /scheduleCrmRecovery/);
  assert.match(scheduler, /activeController\?\.abort\(\)/);
  assert.match(scheduler, /if \(running\) await running/);
});

test("the lightweight Windows service host compiles", (context) => {
  if (process.platform !== "win32") return context.skip("Windows-only compiler check");
  const compiler = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  if (!fsSync.existsSync(compiler)) return context.skip(".NET Framework compiler unavailable");
  const output = path.join(os.tmpdir(), `AlasleeService-${process.pid}.exe`);
  const source = path.join(process.cwd(), "scripts", "windows-service", "AlasleeService.cs");
  try {
    const result = spawnSync(compiler, [
      "/nologo", "/target:exe", "/optimize+", `/out:${output}`,
      "/reference:System.ServiceProcess.dll", source,
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(fsSync.statSync(output).size < 100_000);
  } finally {
    fsSync.rmSync(output, { force: true });
  }
});

test("production configuration accepts dynamic LAN URLs and rejects mismatched PostgreSQL ports", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alaslee-config-test-"));
  try {
    const valid = path.join(root, "valid.env");
    await fs.writeFile(valid, environment("55432"));
    assert.equal(runReport(valid).ok, true);

    const invalid = path.join(root, "invalid.env");
    await fs.writeFile(invalid, environment("5433"));
    const invalidReport = runReport(invalid);
    assert.equal(invalidReport.ok, false);
    assert.ok(invalidReport.errors.some((message) => message.includes("CRM_POSTGRES_PORT")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function environment(port) {
  return `NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=
AI_PROVIDER=gpt
OPENAI_API_KEY=test-only
CRM_POSTGRES_PORT=${port}
CRM_DATABASE_URL=postgresql://app:test@127.0.0.1:55432/test
CRM_DATA_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
CRM_STAFF_PIN=2468
CRM_SUPERUSER_PIN=8642
CRM_LOGIN_RATE_LIMIT_DISABLED=false
CRM_SECURE_COOKIE=false
`;
}

function runReport(environmentFile) {
  const script = "import('./src/configValidation.js').then(({runtimeConfigReport})=>console.log(JSON.stringify(runtimeConfigReport())))";
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("CRM_") && !name.startsWith("SUPABASE_") && !name.startsWith("OPENAI_") && !name.startsWith("GEMINI_") && !new Set(["NODE_ENV", "PORT", "PUBLIC_BASE_URL", "AI_PROVIDER"]).has(name)));
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(), encoding: "utf8", env: { ...inherited, ENV_FILE: environmentFile },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}
