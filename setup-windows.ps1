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

function Test-NativeCommand([string]$FilePath, [string[]]$ArgumentList) {
    # Windows PowerShell 5.1 can promote native stderr to a terminating
    # NativeCommandError when ErrorActionPreference is Stop. Connection probes
    # are expected to fail sometimes, so decide from the process exit code.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FilePath @ArgumentList *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Invoke-NativeCommand([string]$FilePath, [string[]]$ArgumentList, [string]$Action) {
    # Send native output to the console without leaking it into a PowerShell
    # function's return value. PowerShell otherwise treats every stdout line as
    # part of assignments such as `$port = Initialize-IsolatedPostgres ...`.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FilePath @ArgumentList 2>&1 | Out-Host
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "$Action failed (exit code $exitCode)."
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
            return [string]$Matches[1]
        }
    }
    throw "$Name is missing from .env."
}

function Get-NativePostgresPort([string]$EnvironmentPath) {
    $configuredValue = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_PORT"
    [int]$port = 0
    if ([int]::TryParse($configuredValue, [ref]$port) -and $port -ge 1 -and $port -le 65535) {
        return $port
    }

    # Recover setup runs affected by the former PowerShell stdout-capture bug.
    $portFile = Join-Path $env:ProgramData "AlasleeOperationsStudio\PostgreSQL\port.txt"
    if (Test-Path -LiteralPath $portFile) {
        $savedValue = [IO.File]::ReadAllText($portFile).Trim()
        [int]$savedPort = 0
        if ([int]::TryParse($savedValue, [ref]$savedPort) -and $savedPort -ge 1 -and $savedPort -le 65535) {
            Write-Warning "Repairing invalid CRM_POSTGRES_PORT in .env with the isolated PostgreSQL port $savedPort."
            Set-EnvValue $EnvironmentPath "CRM_POSTGRES_PORT" ([string]$savedPort)
            return $savedPort
        }
    }

    throw "CRM_POSTGRES_PORT must be a number between 1 and 65535."
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
        $initdb = Join-Path $bin "initdb.exe"
        $pgCtl = Join-Path $bin "pg_ctl.exe"
        if ((Test-Path -LiteralPath $psql) -and (Test-Path -LiteralPath $createdb) -and
            (Test-Path -LiteralPath $ready) -and (Test-Path -LiteralPath $initdb) -and
            (Test-Path -LiteralPath $pgCtl)) {
            return @{ Psql = $psql; CreateDb = $createdb; Ready = $ready; InitDb = $initdb; PgCtl = $pgCtl }
        }
    }
    return $null
}

function Test-PostgresAdminLogin($Tools, [int]$Port, [string]$Password) {
    $previousPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Password
    try {
        return Test-NativeCommand $Tools.Psql @(
            "--no-password", "-h", "127.0.0.1", "-p", [string]$Port,
            "-U", "postgres", "-d", "postgres", "-tAc", "SELECT 1"
        )
    } finally {
        if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $previousPassword }
    }
}

function Find-FreeTcpPort([int]$StartPort = 55432, [int]$Attempts = 100) {
    for ($port = $StartPort; $port -lt ($StartPort + $Attempts); $port++) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
        try {
            $listener.Start()
            return $port
        } catch {
            continue
        } finally {
            $listener.Stop()
        }
    }
    throw "No free local TCP port was found for the isolated Alaslee PostgreSQL instance."
}

function Initialize-IsolatedPostgres($Tools, [string]$Password) {
    Write-Step "Creating an isolated Alaslee PostgreSQL instance"
    Write-Warning "The existing PostgreSQL administrator password does not match .env. The existing server will not be modified."

    $serviceName = "AlasleeOperationsStudioPostgres"
    $clusterRoot = Join-Path $env:ProgramData "AlasleeOperationsStudio\PostgreSQL"
    $dataDir = Join-Path $clusterRoot "data"
    $portFile = Join-Path $clusterRoot "port.txt"
    New-Item -ItemType Directory -Force -Path $clusterRoot | Out-Null

    if (Test-Path -LiteralPath $portFile) {
        $port = [int][IO.File]::ReadAllText($portFile)
    } else {
        $port = Find-FreeTcpPort
    }

    $versionFile = Join-Path $dataDir "PG_VERSION"
    if (-not (Test-Path -LiteralPath $versionFile)) {
        if ((Test-Path -LiteralPath $dataDir) -and (Get-ChildItem -LiteralPath $dataDir -Force | Select-Object -First 1)) {
            throw "The dedicated PostgreSQL data folder is incomplete: $dataDir. Rename it and run setup again."
        }
        $passwordFile = Join-Path $env:TEMP ("alaslee-pg-password-" + [Guid]::NewGuid().ToString("N") + ".txt")
        try {
            [IO.File]::WriteAllText($passwordFile, $Password + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
            Invoke-NativeCommand $Tools.InitDb @(
                "-D", $dataDir, "-U", "postgres", "--pwfile=$passwordFile",
                "--auth-host=scram-sha-256", "--auth-local=scram-sha-256", "--encoding=UTF8"
            ) "Initializing the isolated Alaslee PostgreSQL data directory"
        } finally {
            Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
        }
        [IO.File]::AppendAllText(
            (Join-Path $dataDir "postgresql.conf"),
            "`n# Alaslee Operations Studio isolated instance`nlisten_addresses = '127.0.0.1'`nport = $port`n",
            (New-Object Text.UTF8Encoding($false))
        )
        [IO.File]::WriteAllText($portFile, [string]$port, (New-Object Text.UTF8Encoding($false)))
    }

    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if (-not $service) {
        Invoke-NativeCommand $Tools.PgCtl @(
            "register", "-N", $serviceName, "-D", $dataDir, "-S", "auto"
        ) "Registering the isolated Alaslee PostgreSQL Windows service"
        $service = Get-Service -Name $serviceName
    }
    if ($service.Status -ne "Running") { Start-Service -Name $serviceName }
    Wait-ForNativePostgres $Tools $port
    if (-not (Test-PostgresAdminLogin $Tools $port $Password)) {
        throw "The isolated Alaslee PostgreSQL instance started but rejected its generated password."
    }
    Write-Host "Isolated Alaslee PostgreSQL is ready on port $port." -ForegroundColor Green
    return $port
}

function Wait-ForNativePostgres($Tools, [int]$Port, [int]$TimeoutSeconds = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-NativeCommand $Tools.Ready @("-h", "127.0.0.1", "-p", [string]$Port, "-U", "postgres")) { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "Native PostgreSQL did not become ready on 127.0.0.1:$Port."
}

function Install-NativePostgres([string]$EnvironmentPath) {
    $port = Get-NativePostgresPort $EnvironmentPath
    $password = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_PASSWORD"
    if (-not $password) { throw "CRM_POSTGRES_PASSWORD must not be empty." }

    $tools = Find-PostgresTools
    $installedNow = $false
    if (-not $tools) {
        Write-Step "Installing native PostgreSQL 16 (no Docker or virtualization)"
        $installerOptions = "--mode unattended --unattendedmodeui minimal --superpassword `"$password`" --servicepassword `"$password`" --serverport $port"
        & winget.exe install --id PostgreSQL.PostgreSQL.16 --exact --source winget `
            --accept-package-agreements --accept-source-agreements --disable-interactivity `
            --override $installerOptions
        Assert-LastExitCode "Installing native PostgreSQL 16"
        $tools = Find-PostgresTools
        $installedNow = $true
    }
    if (-not $tools) { throw "PostgreSQL tools were not found after installation." }

    $services = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    foreach ($service in $services) {
        if ($service.Status -ne "Running") { Start-Service -Name $service.Name }
    }
    if ($installedNow) {
        Wait-ForNativePostgres $tools $port
    } else {
        if (-not (Test-NativeCommand $tools.Ready @("-h", "127.0.0.1", "-p", [string]$port, "-U", "postgres"))) {
            Write-Warning "No compatible PostgreSQL server is listening on port $port; an isolated Alaslee instance will be created."
        }
    }
    return $tools
}

function Initialize-NativeCrmDatabase($Tools, [string]$EnvironmentPath) {
    Write-Step "Creating/checking the native CRM database"
    $port = Get-NativePostgresPort $EnvironmentPath
    $database = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_DB"
    $user = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_USER"
    $password = Get-EnvValue $EnvironmentPath "CRM_POSTGRES_PASSWORD"
    if ($database -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "CRM_POSTGRES_DB contains unsupported characters." }
    if ($user -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "CRM_POSTGRES_USER contains unsupported characters." }

    if (-not (Test-PostgresAdminLogin $Tools $port $password)) {
        $port = [int](Initialize-IsolatedPostgres $Tools $password)
        Set-EnvValue $EnvironmentPath "CRM_POSTGRES_PORT" ([string]$port)
    }

    $escapedPassword = $password -replace "'", "''"
    $roleSql = "DO `$alaslee`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$user') THEN CREATE ROLE `"$user`" LOGIN PASSWORD '$escapedPassword'; ELSE ALTER ROLE `"$user`" WITH LOGIN PASSWORD '$escapedPassword'; END IF; END `$alaslee`$;"
    $previousPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $password
    try {
        & $Tools.Psql --no-password -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -c $roleSql
        Assert-LastExitCode "Creating the CRM PostgreSQL role"
        $databaseCheckOutput = & $Tools.Psql --no-password -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$database'"
        Assert-LastExitCode "Checking the CRM PostgreSQL database"
        $databaseExists = $databaseCheckOutput -eq "1"
        if (-not $databaseExists) {
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
    try {
        $nativePostgresTools = Install-NativePostgres $environmentPath
        Initialize-NativeCrmDatabase $nativePostgresTools $environmentPath
    } catch {
        Write-Host "Native PostgreSQL setup failed at script line $($_.InvocationInfo.ScriptLineNumber)." -ForegroundColor Red
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
        throw
    }
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
