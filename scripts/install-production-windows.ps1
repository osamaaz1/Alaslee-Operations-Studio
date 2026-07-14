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
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$environmentPath = Resolve-AlasleePath $projectRoot $EnvironmentFile
$values = Get-AlasleeEnvironment $environmentPath
$port = 0
if (-not [int]::TryParse($values.PORT, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw 'PORT must be a valid TCP port.' }
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

$taskName = 'Alaslee Operations Studio Production'
$startScript = Join-Path $PSScriptRoot 'start-production.ps1'
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -EnvironmentFile `"$environmentPath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null
if (-not $DoNotStart) { Start-ScheduledTask -TaskName $taskName }

Write-Host 'Production installation completed.' -ForegroundColor Green
& (Join-Path $PSScriptRoot 'show-lan-url.ps1') -EnvironmentFile $environmentPath
