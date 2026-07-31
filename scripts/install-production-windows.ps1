param(
    [string]$EnvironmentFile = '.env',
    [switch]$SkipBackup,
    [switch]$DoNotStart
)

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $elevatedArguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + $PSCommandPath + '"'),
        '-EnvironmentFile', ('"' + $EnvironmentFile + '"')
    )
    if ($SkipBackup) { $elevatedArguments += '-SkipBackup' }
    if ($DoNotStart) { $elevatedArguments += '-DoNotStart' }

    $elevatedProcess = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $elevatedArguments
    exit $elevatedProcess.ExitCode
}

. (Join-Path $PSScriptRoot 'env-utils.ps1')

function New-SecureHex([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($buffer) } finally { $random.Dispose() }
    return -join ($buffer | ForEach-Object { $_.ToString('x2') })
}

function ConvertTo-ServiceConfigValue([string]$Value) {
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))
}

function Write-ServiceConfiguration([string]$Path, [Collections.IDictionary]$Settings) {
    $lines = foreach ($entry in $Settings.GetEnumerator()) {
        '{0}={1}' -f $entry.Key, (ConvertTo-ServiceConfigValue ([string]$entry.Value))
    }
    [IO.File]::WriteAllLines($Path, $lines, (New-Object Text.UTF8Encoding($false)))
}

function Find-ServiceCompiler {
    foreach ($candidate in @(
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
    )) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'The built-in Windows .NET Framework C# compiler was not found.'
}

function Invoke-ServiceController([string[]]$Arguments, [string]$FailureMessage) {
    & sc.exe @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "$FailureMessage (sc.exe exit code $LASTEXITCODE)." }
}

function Get-PostgresServiceDependency($EnvironmentValues) {
    try {
        $database = Get-AlasleeDatabaseParts ([string]$EnvironmentValues.CRM_DATABASE_URL)
        if ($database.Host -notin @('127.0.0.1', 'localhost', '::1')) { return $null }
        $listener = Get-NetTCPConnection -State Listen -LocalPort $database.Port -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $listener) { return $null }
        $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
        $candidateProcessIds = @([int]$listener.OwningProcess)
        if ($listenerProcess -and $listenerProcess.ParentProcessId) { $candidateProcessIds += [int]$listenerProcess.ParentProcessId }
        $service = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object {
            $candidateProcessIds -contains [int]$_.ProcessId -and $_.Name -match '(?i)postgres'
        } | Select-Object -First 1
        if ($service) { return [string]$service.Name }
        return $null
    } catch {
        Write-Warning "The PostgreSQL Windows service dependency could not be detected: $($_.Exception.Message)"
        return $null
    }
}

function Wait-ForServiceHealth($Service, [string]$HealthUrl, [string]$LogRoot, [int]$TimeoutSeconds = 45) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Service.Refresh()
        if ($Service.Status -eq [ServiceProcess.ServiceControllerStatus]::Stopped) { break }
        try {
            $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
            if ([int]$response.StatusCode -eq 200) { return }
        } catch {
            Start-Sleep -Milliseconds 400
        }
    }
    $serviceLog = Join-Path $LogRoot ("server-service-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
    $errorLog = Join-Path $LogRoot ("server-service-{0}.error.log" -f (Get-Date -Format 'yyyyMMdd'))
    $detail = @($serviceLog, $errorLog) | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
        Get-Content -LiteralPath $_ -Tail 12
    }
    throw "The Alaslee background service did not become healthy at $HealthUrl.`n$($detail -join [Environment]::NewLine)"
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$environmentPath = Resolve-AlasleePath $projectRoot $EnvironmentFile
$values = Get-AlasleeEnvironment $environmentPath
$port = 0
$portValue = if ($values.ContainsKey('PORT') -and -not [string]::IsNullOrWhiteSpace([string]$values.PORT)) { [string]$values.PORT } else { '3000' }
if (-not [int]::TryParse($portValue, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw 'PORT must be a valid TCP port.' }
$privateNetworks = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' -and $_.NetworkCategory -eq 'Private' }
if (-not $privateNetworks) { throw 'The active store network must be marked Private in Windows before installation.' }

Set-Location -LiteralPath $projectRoot
$env:ENV_FILE = $environmentPath
$env:NODE_ENV = 'production'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
if (-not $SkipBackup) {
    & (Join-Path $PSScriptRoot 'backup-production.ps1') -EnvironmentFile $environmentPath
}
& (Join-Path $PSScriptRoot 'harden-postgres-role.ps1') -EnvironmentFile $environmentPath
$values = Get-AlasleeEnvironment $environmentPath
& npm.cmd run daftra:ensure-ready
if ($LASTEXITCODE -ne 0) { throw 'The configured Daftra snapshot could not be refreshed.' }
& npm.cmd run production:preflight
if ($LASTEXITCODE -ne 0) { throw 'Production preflight failed.' }

$firewallAllowName = 'Alaslee Operations Studio - Store LAN'
$firewallBlockName = 'Alaslee Operations Studio - Block Public'
Get-NetFirewallRule -DisplayName $firewallAllowName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName $firewallBlockName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $firewallAllowName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Private -RemoteAddress LocalSubnet | Out-Null
New-NetFirewallRule -DisplayName $firewallBlockName -Direction Inbound -Action Block -Protocol TCP -LocalPort $port -Profile Public | Out-Null

foreach ($secretPath in @($environmentPath, (Join-Path $projectRoot 'correct.env')) | Where-Object { Test-Path -LiteralPath $_ }) {
    & icacls.exe $secretPath /inheritance:r /grant:r "${env:USERNAME}:(M)" 'SYSTEM:(R)' 'Administrators:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not protect environment file ACL: $secretPath" }
}

$serviceName = 'AlasleeOperationsStudio'
$serviceDisplayName = 'Alaslee Operations Studio'
$legacyTaskName = 'Alaslee Operations Studio Production'
$startScript = Join-Path $PSScriptRoot 'start-production.ps1'
& $startScript -EnvironmentFile $environmentPath -CleanupOnly -NoBrowser
$legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
if ($legacyTask) { Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false }

$serviceRoot = Join-Path $env:ProgramData 'AlasleeOperationsStudio\Service'
$serviceExecutable = Join-Path $serviceRoot 'AlasleeService.exe'
$serviceConfiguration = Join-Path $serviceRoot 'service.conf'
$serviceSource = Join-Path $PSScriptRoot 'windows-service\AlasleeService.cs'
$serverEntryPoint = Join-Path $projectRoot 'src\server.js'
$logRoot = Join-Path $projectRoot 'diagnostics\logs'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$configuredHost = if ($values.ContainsKey('HOST')) { [string]$values.HOST } else { '' }
$serviceHost = if ([string]::IsNullOrWhiteSpace($configuredHost)) { '0.0.0.0' } else { $configuredHost }
$pipeName = 'AlasleeOperationsStudioControl'

New-Item -ItemType Directory -Force -Path $serviceRoot, $logRoot | Out-Null
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService -and $existingService.Status -ne 'Stopped') {
    Stop-Service -Name $serviceName -ErrorAction Stop
    $existingService.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(35))
}

$compiler = Find-ServiceCompiler
& $compiler /nologo /target:exe /optimize+ "/out:$serviceExecutable" /reference:System.ServiceProcess.dll $serviceSource
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $serviceExecutable -PathType Leaf)) {
    throw 'The lightweight Windows service host could not be compiled.'
}

Write-ServiceConfiguration $serviceConfiguration ([ordered]@{
    ProjectRoot = $projectRoot
    EnvironmentFile = $environmentPath
    NodePath = $nodePath
    ServerEntryPoint = $serverEntryPoint
    LogDirectory = $logRoot
    Host = $serviceHost
    PipeName = $pipeName
    ShutdownToken = (New-SecureHex 32)
    LogRetentionDays = '14'
})

& icacls.exe $serviceRoot /inheritance:r /grant:r 'SYSTEM:(OI)(CI)(F)' 'Administrators:(OI)(CI)(F)' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not protect the Windows service files: $serviceRoot" }

$dependencies = @('Tcpip')
$postgresService = Get-PostgresServiceDependency $values
if ($postgresService) { $dependencies += $postgresService }
$binaryPath = '"' + $serviceExecutable + '"'
if ($existingService) {
    Invoke-ServiceController @('config', $serviceName, 'binPath=', $binaryPath, 'start=', 'auto', 'depend=', ($dependencies -join '/')) 'Could not update the Alaslee Windows service'
} else {
    New-Service -Name $serviceName -BinaryPathName $binaryPath -DisplayName $serviceDisplayName -StartupType Automatic -DependsOn $dependencies | Out-Null
}
Invoke-ServiceController @('description', $serviceName, 'Alaslee Operations Studio silent production server') 'Could not set the service description'
Invoke-ServiceController @('failure', $serviceName, 'reset=', '86400', 'actions=', 'restart/60000/restart/60000/restart/300000') 'Could not set the service recovery policy'
Invoke-ServiceController @('failureflag', $serviceName, '1') 'Could not enable the service recovery policy'

if (-not $DoNotStart) {
    Start-Service -Name $serviceName
    $service = Get-Service -Name $serviceName
    $healthHost = if ($serviceHost -in @('0.0.0.0', '::')) { '127.0.0.1' } else { $serviceHost }
    $healthUrl = ([UriBuilder]::new('http', $healthHost, $port)).Uri.GetLeftPart([UriPartial]::Authority) + '/health/live'
    Wait-ForServiceHealth $service $healthUrl $logRoot
}

Write-Host 'Production installation completed.' -ForegroundColor Green
Write-Host "Windows service: $serviceDisplayName ($serviceName)" -ForegroundColor Green
Write-Host "Silent daily logs: $logRoot\server-service-YYYYMMDD*.log" -ForegroundColor Green
& (Join-Path $PSScriptRoot 'show-lan-url.ps1') -EnvironmentFile $environmentPath
