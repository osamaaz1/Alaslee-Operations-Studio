param([string]$EnvironmentFile = '.env')

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$environmentPath = if ([IO.Path]::IsPathRooted($EnvironmentFile)) { [IO.Path]::GetFullPath($EnvironmentFile) } else { [IO.Path]::GetFullPath((Join-Path $projectRoot $EnvironmentFile)) }
if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) { throw "Environment file not found: $environmentPath" }
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$values = Get-AlasleeEnvironment $environmentPath

Set-Location -LiteralPath $projectRoot
$env:ENV_FILE = $environmentPath
$env:NODE_ENV = 'production'
$configuredHost = [string]$values.HOST
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

& npm.cmd run production:preflight
if ($LASTEXITCODE -ne 0) { throw "Production preflight failed. The server was not started." }

$serverEntryPoint = Join-Path $projectRoot 'src\server.js'
$serverProcess = Start-Process -FilePath node.exe -ArgumentList @("`"$serverEntryPoint`"") `
    -NoNewWindow -Wait -PassThru -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath
exit $serverProcess.ExitCode
