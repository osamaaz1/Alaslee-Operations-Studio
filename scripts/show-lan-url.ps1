param([string]$EnvironmentFile = '.env')

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$values = Get-AlasleeEnvironment (Resolve-AlasleePath $projectRoot $EnvironmentFile)
$port = [int]$values.PORT
$privateInterfaces = Get-NetConnectionProfile | Where-Object {
    $_.NetworkCategory -eq 'Private' -and $_.IPv4Connectivity -ne 'Disconnected'
} | Select-Object -ExpandProperty InterfaceIndex -Unique
$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object {
    $_.InterfaceIndex -in $privateInterfaces -and $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)' -and $_.AddressState -eq 'Preferred'
} | Select-Object -ExpandProperty IPAddress -Unique
if (-not $addresses) {
    Write-Host "http://127.0.0.1:$port" -ForegroundColor Green
    Write-Warning 'No active private IPv4 address was found. The application is available on this computer only.'
    exit 0
}
foreach ($address in $addresses) { Write-Host "http://${address}:$port" -ForegroundColor Green }
Write-Warning 'The selected dynamic IPv4 address can change after a router or computer restart.'
