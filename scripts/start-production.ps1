param(
    [string]$EnvironmentFile = '.env',
    [switch]$NoBrowser,
    [switch]$CleanupOnly
)

$ErrorActionPreference = 'Stop'
$productionTaskName = 'Alaslee Operations Studio Production'

function Get-AlasleeServerProcesses([string]$ServerEntryPoint, [int]$Port) {
    $listenerProcessIds = @(
        Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
    return @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
        $commandLine = [string]$_.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
        $sameEntryPoint = $commandLine.IndexOf($ServerEntryPoint, [StringComparison]::OrdinalIgnoreCase) -ge 0
        $exportedAlasleeCopy = $commandLine -match '(?i)Alaslee-Operations-Studio(?:-main)?[^"\r\n]*[\\/]src[\\/]server\.js'
        $serverOnConfiguredPort = $listenerProcessIds -contains [int]$_.ProcessId -and $commandLine -match '(?i)[\\/]src[\\/]server\.js(?:[\s"]|$)'
        return $sameEntryPoint -or $exportedAlasleeCopy -or $serverOnConfiguredPort
    })
}

function Stop-PreviousProductionSessions([string]$ServerEntryPoint, [int]$Port, [switch]$StopScheduledTask) {
    if ($StopScheduledTask) {
        $task = Get-ScheduledTask -TaskName $productionTaskName -ErrorAction SilentlyContinue
        if ($task -and $task.State -eq 'Running') {
            Write-Host 'Stopping the previous Alaslee scheduled production session...' -ForegroundColor Yellow
            Stop-ScheduledTask -TaskName $productionTaskName -ErrorAction Stop
            Start-Sleep -Milliseconds 500
        }
    }

    $servers = @(Get-AlasleeServerProcesses -ServerEntryPoint $ServerEntryPoint -Port $Port)
    foreach ($server in $servers) {
        Write-Host "Stopping previous Alaslee server process $($server.ProcessId)..." -ForegroundColor Yellow
        Stop-Process -Id $server.ProcessId -Force -ErrorAction Stop
    }
    if ($servers.Count -gt 0) { Start-Sleep -Milliseconds 500 }

    $remaining = @(Get-AlasleeServerProcesses -ServerEntryPoint $ServerEntryPoint -Port $Port)
    if ($remaining.Count -gt 0) {
        throw "Could not stop previous Alaslee server process(es): $($remaining.ProcessId -join ', ')."
    }
}

function Wait-ForProductionServer([Diagnostics.Process]$Process, [string]$HealthUrl, [int]$TimeoutSeconds = 45) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Process.Refresh()
        if ($Process.HasExited) { return $false }
        try {
            $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
            if ([int]$response.StatusCode -eq 200) { return $true }
        } catch {
            Start-Sleep -Milliseconds 350
        }
    }
    return $false
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$environmentPath = if ([IO.Path]::IsPathRooted($EnvironmentFile)) { [IO.Path]::GetFullPath($EnvironmentFile) } else { [IO.Path]::GetFullPath((Join-Path $projectRoot $EnvironmentFile)) }
if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) { throw "Environment file not found: $environmentPath" }
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$values = Get-AlasleeEnvironment $environmentPath
$port = 0
$portValue = if ($values.ContainsKey('PORT') -and -not [string]::IsNullOrWhiteSpace([string]$values['PORT'])) { [string]$values['PORT'] } else { '3000' }
if (-not [int]::TryParse($portValue, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    throw 'PORT must be a valid TCP port.'
}
$serverEntryPoint = Join-Path $projectRoot 'src\server.js'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isSystemSession = $identity.IsSystem

if ($CleanupOnly) {
    Stop-PreviousProductionSessions -ServerEntryPoint $serverEntryPoint -Port $port -StopScheduledTask
    exit 0
}

if (-not $isSystemSession) {
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Stop-PreviousProductionSessions -ServerEntryPoint $serverEntryPoint -Port $port -StopScheduledTask
    } else {
        $cleanupArguments = @(
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', ('"' + $PSCommandPath + '"'),
            '-EnvironmentFile', ('"' + $environmentPath + '"'),
            '-CleanupOnly',
            '-NoBrowser'
        )
        $cleanupProcess = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $cleanupArguments
        if ($cleanupProcess.ExitCode -ne 0) { throw 'The previous production session could not be closed.' }
    }
} else {
    Stop-PreviousProductionSessions -ServerEntryPoint $serverEntryPoint -Port $port
}

Set-Location -LiteralPath $projectRoot
$env:ENV_FILE = $environmentPath
$env:NODE_ENV = 'production'
$configuredHost = if ($values.ContainsKey('HOST')) { [string]$values['HOST'] } else { '' }
if ([string]::IsNullOrWhiteSpace($configuredHost) -or $configuredHost -in @('0.0.0.0', '::')) {
    $privateInterfaces = Get-NetConnectionProfile | Where-Object {
        $_.NetworkCategory -eq 'Private' -and $_.IPv4Connectivity -ne 'Disconnected'
    } | Sort-Object @{ Expression = { if ($_.IPv4Connectivity -eq 'Internet') { 0 } else { 1 } } }, InterfaceMetric
    $privateAddresses = foreach ($profile in $privateInterfaces) {
        Get-NetIPAddress -InterfaceIndex $profile.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
            $_.AddressState -eq 'Preferred' -and $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)'
        } | Select-Object -ExpandProperty IPAddress
    }
    $selectedAddress = $privateAddresses | Select-Object -First 1
    if ($selectedAddress) {
        $env:HOST = $selectedAddress
        Write-Host "Production is restricted to the private store interface: $selectedAddress" -ForegroundColor Cyan
    } else {
        $env:HOST = '127.0.0.1'
        Write-Warning 'No active private IPv4 address was found. Production will be available on this computer only at http://127.0.0.1.'
    }
} else {
    $env:HOST = $configuredHost
}
$logRoot = Join-Path $projectRoot 'diagnostics\logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logRoot ("server-$logStamp.log")
$errorLogPath = Join-Path $logRoot ("server-$logStamp.error.log")

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "The production client build failed. The server was not started." }

& npm.cmd run crm:import-history
if ($LASTEXITCODE -ne 0) { throw "The analyzed customer history could not be imported. The server was not started." }

& npm.cmd run production:preflight
if ($LASTEXITCODE -ne 0) { throw "Production preflight failed. The server was not started." }

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    throw "Port $port is still in use by process(es): $($listeners.OwningProcess -join ', '). The server was not started."
}

$serverProcess = Start-Process -FilePath node.exe -ArgumentList @("`"$serverEntryPoint`"") `
    -NoNewWindow -PassThru -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath
$browserHost = if ($env:HOST -in @('0.0.0.0', '::')) { '127.0.0.1' } else { $env:HOST }
$uriBuilder = [UriBuilder]::new('http', $browserHost, $port)
$browserUrl = $uriBuilder.Uri.GetLeftPart([UriPartial]::Authority)
$healthUrl = "$browserUrl/health/live"

if (-not (Wait-ForProductionServer -Process $serverProcess -HealthUrl $healthUrl)) {
    $serverProcess.Refresh()
    $detail = if (Test-Path -LiteralPath $errorLogPath) { (Get-Content -LiteralPath $errorLogPath -Tail 12) -join [Environment]::NewLine } else { '' }
    if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
    throw "Production did not become ready at $healthUrl.`n$detail"
}

Write-Host "Production is ready: $browserUrl" -ForegroundColor Green
if (-not $NoBrowser -and -not $isSystemSession) {
    try {
        Start-Process -FilePath $browserUrl | Out-Null
    } catch {
        Write-Warning "The browser could not be opened automatically. Open $browserUrl manually."
    }
}

Wait-Process -Id $serverProcess.Id
$serverProcess.Refresh()
exit $serverProcess.ExitCode
