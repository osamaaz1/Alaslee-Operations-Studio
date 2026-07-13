[CmdletBinding()]
param(
    [switch]$SkipDocker,
    [switch]$SkipTests,
    [switch]$ForceEnvironment
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Restart-AsAdministrator {
    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"{0}"' -f $PSCommandPath))
    if ($SkipDocker) { $arguments += "-SkipDocker" }
    if ($SkipTests) { $arguments += "-SkipTests" }
    if ($ForceEnvironment) { $arguments += "-ForceEnvironment" }
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    exit $process.ExitCode
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = @($machine, $user) -join ";"
}

function Assert-LastExitCode([string]$Action) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed (exit code $LASTEXITCODE)."
    }
}

function Install-WingetPackage([string]$Id, [string]$Name) {
    Write-Step "Installing/checking $Name"
    & winget.exe list --id $Id --exact --source winget --accept-source-agreements --disable-interactivity *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$Name is already installed." -ForegroundColor Green
        Refresh-Path
        return
    }
    & winget.exe install --id $Id --exact --source winget --accept-package-agreements --accept-source-agreements --silent --disable-interactivity
    Assert-LastExitCode "Installing $Name"
    Refresh-Path
}

function New-RandomHex([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

function New-RandomPin {
    $buffer = New-Object byte[] 4
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    $number = [BitConverter]::ToUInt32($buffer, 0) % 900000 + 100000
    return $number.ToString()
}

function Set-EnvValue([string]$Path, [string]$Name, [string]$Value) {
    $content = [IO.File]::ReadAllText($Path)
    $pattern = "(?m)^" + [Regex]::Escape($Name) + "=.*$"
    $line = "$Name=$Value"
    if ([Regex]::IsMatch($content, $pattern)) {
        $content = [Regex]::Replace($content, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($match) $line })
    } else {
        $content = $content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
    }
    [IO.File]::WriteAllText($Path, $content, (New-Object Text.UTF8Encoding($false)))
}

function Get-EnvValue([string]$Path, [string]$Name) {
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -match ("^" + [Regex]::Escape($Name) + "=(.*)$")) {
            return $Matches[1].Trim()
        }
    }
    throw "$Name is missing from .env."
}

function Find-PostgresTools {
    $roots = @()
    $postgresRoot = Join-Path $env:ProgramFiles "PostgreSQL"
    if (Test-Path -LiteralPath $postgresRoot) {
        $roots += Get-ChildItem -LiteralPath $postgresRoot -Directory |
            Sort-Object { try { [version]$_.Name } catch { [version]"0.0" } } -Descending
    }
    foreach ($root in $roots) {
        $bin = Join-Path $root.FullName "bin"
        $psql = Join-Path $bin "psql.exe"
        $createdb = Join-Path $bin "createdb.exe"
        $ready = Join-Path $bin "pg_isready.exe"
        if ((Test-Path -LiteralPath $psql) -and (Test-Path -LiteralPath $createdb) -and (Test-Path -LiteralPath $ready)) {
            return @{ Psql = $psql; CreateDb = $createdb; Ready = $ready }
        }
    }
    return $null
}

function Wait-ForNativePostgres($Tools, [int]$Port, [int]$TimeoutSeconds = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        & $Tools.Ready -h 127.0.0.1 -p $Port -U postgres *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "Native PostgreSQL did not become ready on 127.0.0.1:$Port."
}

function Install-NativePostgres([string]$EnvironmentPath) {
    $port = [int](Get-EnvValue $EnvironmentPath "CRM_POSTGRES_PORT")
    $password = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_PASSWORD"
    if (-not $password) { throw "CRM_POSTGRES_PASSWORD must not be empty." }

    $tools = Find-PostgresTools
    if (-not $tools) {
        Write-Step "Installing native PostgreSQL 16 (no Docker or virtualization)"
        $installerOptions = "--mode unattended --unattendedmodeui minimal --superpassword `"$password`" --servicepassword `"$password`" --serverport $port"
        & winget.exe install --id PostgreSQL.PostgreSQL.16 --exact --source winget `
            --accept-package-agreements --accept-source-agreements --disable-interactivity `
            --override $installerOptions
        Assert-LastExitCode "Installing native PostgreSQL 16"
        $tools = Find-PostgresTools
    }
    if (-not $tools) { throw "PostgreSQL tools were not found after installation." }

    $services = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    foreach ($service in $services) {
        if ($service.Status -ne "Running") { Start-Service -Name $service.Name }
    }
    Wait-ForNativePostgres $tools $port
    return $tools
}

function Initialize-NativeCrmDatabase($Tools, [string]$EnvironmentPath) {
    Write-Step "Creating/checking the native CRM database"
    $port = [int](Get-EnvValue $EnvironmentPath "CRM_POSTGRES_PORT")
    $database = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_DB"
    $user = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_USER"
    $password = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_PASSWORD"
    if ($database -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "CRM_POSTGRES_DB contains unsupported characters." }
    if ($user -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "CRM_POSTGRES_USER contains unsupported characters." }

    $escapedPassword = $password.Replace("'", "''")
    $roleSql = "DO `$alaslee`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$user') THEN CREATE ROLE `"$user`" LOGIN PASSWORD '$escapedPassword'; ELSE ALTER ROLE `"$user`" WITH LOGIN PASSWORD '$escapedPassword'; END IF; END `$alaslee`$;"
    $previousPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $password
    try {
        & $Tools.Psql --no-password -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -c $roleSql
        Assert-LastExitCode "Creating the CRM PostgreSQL role"
        $databaseCheckOutput = & $Tools.Psql --no-password -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$database'"
        Assert-LastExitCode "Checking the CRM PostgreSQL database"
        $databaseExists = ([string]$databaseCheckOutput).Trim()
        if ($databaseExists -ne "1") {
            & $Tools.CreateDb --no-password -h 127.0.0.1 -p $port -U postgres --owner $user $database
            Assert-LastExitCode "Creating the CRM PostgreSQL database"
        }
    } finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }

    $encodedPassword = [Uri]::EscapeDataString($password)
    Set-EnvValue $EnvironmentPath "CRM_DATABASE_URL" "postgresql://${user}:$encodedPassword@127.0.0.1:$port/$database"
}

function Initialize-Environment([string]$ProjectRoot) {
    $environmentPath = Join-Path $ProjectRoot ".env"
    $examplePath = Join-Path $ProjectRoot ".env.example"
    if ((Test-Path -LiteralPath $environmentPath) -and -not $ForceEnvironment) {
        Write-Host "Keeping the existing .env file. Use -ForceEnvironment to regenerate it." -ForegroundColor Yellow
        return
    }
    if (-not (Test-Path -LiteralPath $examplePath)) {
        throw ".env.example was not found."
    }
    if (Test-Path -LiteralPath $environmentPath) {
        $backup = "$environmentPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item -LiteralPath $environmentPath -Destination $backup
        Write-Host "Existing environment backed up to $backup" -ForegroundColor Yellow
    }
    Copy-Item -LiteralPath $examplePath -Destination $environmentPath -Force
    $postgresPassword = New-RandomHex 18
    $staffPin = New-RandomPin
    do { $superuserPin = New-RandomPin } while ($superuserPin -eq $staffPin)
    Set-EnvValue $environmentPath "AI_PROVIDER" "free-test"
    Set-EnvValue $environmentPath "CRM_POSTGRES_PASSWORD" $postgresPassword
    Set-EnvValue $environmentPath "CRM_DATABASE_URL" "postgresql://alaslee_crm:$postgresPassword@127.0.0.1:5433/alaslee_crm"
    Set-EnvValue $environmentPath "CRM_DATA_ENCRYPTION_KEY" (New-RandomHex 32)
    Set-EnvValue $environmentPath "CRM_STAFF_PIN" $staffPin
    Set-EnvValue $environmentPath "CRM_SUPERUSER_PIN" $superuserPin
    Write-Host "Created .env with random local secrets." -ForegroundColor Green
    Write-Host "CRM staff PIN: $staffPin" -ForegroundColor Yellow
    Write-Host "CRM superuser PIN: $superuserPin" -ForegroundColor Yellow
    Write-Host "Save these PINs now; they remain available in .env." -ForegroundColor Yellow
}

function Wait-ForDocker([int]$TimeoutSeconds = 240) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        & docker.exe info *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)
    throw "Docker Desktop did not become ready within $TimeoutSeconds seconds. Start Docker Desktop, finish its first-run setup, then run setup-windows.cmd again."
}

function Wait-ForPostgres([int]$TimeoutSeconds = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $status = (& docker.exe inspect --format "{{.State.Health.Status}}" alaslee-crm-postgres 2>$null)
        if ($LASTEXITCODE -eq 0 -and $status -eq "healthy") { return }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    & docker.exe compose --env-file .env -f compose.crm.yml logs --tail 50
    throw "The local PostgreSQL container did not become healthy."
}

if (-not (Test-Administrator)) {
    Write-Host "Administrator access is required for the first-time Windows setup." -ForegroundColor Yellow
    Restart-AsAdministrator
}

$projectRoot = Split-Path -Parent $PSCommandPath
Set-Location -LiteralPath $projectRoot
Write-Host "Alaslee Operations Studio - Windows 11 setup" -ForegroundColor Green
Write-Host "Project: $projectRoot"

Write-Step "Checking Windows Package Manager"
if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    try {
        Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe
    } catch {
        Write-Warning $_.Exception.Message
    }
}
if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "WinGet is unavailable. Install or update 'App Installer' from Microsoft Store, then run this file again: https://apps.microsoft.com/detail/9nblggh4nns1"
}

Install-WingetPackage "OpenJS.NodeJS.LTS" "Node.js LTS"
Install-WingetPackage "Git.Git" "Git"

if (-not $SkipDocker) {
    Write-Step "Enabling the WSL 2 platform"
    $virtualization = Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty VirtualizationFirmwareEnabled
    if (-not $virtualization) {
        Write-Warning "CPU virtualization appears disabled. Enable Intel VT-x/AMD-V in UEFI/BIOS before Docker can run."
    }
    & wsl.exe --install --no-distribution
    if ($LASTEXITCODE -notin @(0, -1)) { Write-Warning "WSL setup returned exit code $LASTEXITCODE." }
    & wsl.exe --update
    if ($LASTEXITCODE -ne 0) { Write-Warning "WSL update returned exit code $LASTEXITCODE; a Windows restart may be required." }
    Install-WingetPackage "Docker.DockerDesktop" "Docker Desktop"
}

Refresh-Path
Write-Step "Checking installed tools"
& node.exe --version
Assert-LastExitCode "Checking Node.js"
& npm.cmd --version
Assert-LastExitCode "Checking npm"
if (-not $SkipDocker) {
    & docker.exe --version
    Assert-LastExitCode "Checking Docker"
}

Write-Step "Creating the local environment"
Initialize-Environment $projectRoot
New-Item -ItemType Directory -Force -Path "data", "uploads" | Out-Null
$environmentPath = Join-Path $projectRoot ".env"
$nativePostgresTools = $null
if ($SkipDocker) {
    $nativePostgresTools = Install-NativePostgres $environmentPath
    Initialize-NativeCrmDatabase $nativePostgresTools $environmentPath
}

Write-Step "Installing exact project dependencies from package-lock.json"
& npm.cmd ci --no-fund --no-audit
Assert-LastExitCode "npm ci"

if (-not $SkipDocker) {
    Write-Step "Starting Docker Desktop"
    & docker.exe info *> $null
    if ($LASTEXITCODE -ne 0) {
        $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
        if (-not (Test-Path -LiteralPath $dockerDesktop)) { throw "Docker Desktop executable was not found." }
        # Docker may show a first-run agreement that the user must accept.
        Start-Process -FilePath $dockerDesktop
    }
    Wait-ForDocker

    Write-Step "Starting local PostgreSQL"
    & docker.exe compose --env-file .env -f compose.crm.yml up -d
    Assert-LastExitCode "Starting PostgreSQL"
    Wait-ForPostgres

    Write-Step "Applying CRM database migrations"
    & npm.cmd run crm:migrate
    Assert-LastExitCode "CRM migrations"
} else {
    Write-Step "Applying CRM database migrations to native PostgreSQL"
    & npm.cmd run crm:migrate
    Assert-LastExitCode "CRM migrations"
}

if (-not $SkipTests) {
    Write-Step "Building the web interface"
    & npm.cmd run build
    Assert-LastExitCode "Application build"
    Write-Step "Running automated tests"
    & npm.cmd test
    Assert-LastExitCode "Automated tests"
}

Write-Host "`nSetup completed successfully." -ForegroundColor Green
Write-Host "Run start-local.cmd, then open http://localhost:5173"
if ($SkipDocker) { Write-Host "CRM is using native PostgreSQL; Docker and virtualization are not required." -ForegroundColor Green }
