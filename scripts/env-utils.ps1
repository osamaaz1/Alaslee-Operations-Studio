Set-StrictMode -Version Latest

function Get-AlasleeEnvironment([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Environment file not found: $Path" }
    $result = @{}
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { throw "Invalid environment line for $Path." }
        $value = [string]$Matches[2]
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $result[[string]$Matches[1]] = $value
    }
    return $result
}

function Resolve-AlasleePath([string]$ProjectRoot, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
    return [IO.Path]::GetFullPath((Join-Path $ProjectRoot $Value))
}

function Get-AlasleeDatabaseParts([string]$Url) {
    try { $uri = [Uri]$Url } catch { throw "CRM_DATABASE_URL is not a valid URL." }
    if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw "CRM_DATABASE_URL must use PostgreSQL." }
    $credentials = $uri.UserInfo.Split(':', 2)
    if ($credentials.Count -lt 2) { throw "CRM_DATABASE_URL must include a username and password." }
    $port = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
    return [pscustomobject]@{
        Host = $uri.Host
        Port = [int]$port
        User = [Uri]::UnescapeDataString($credentials[0])
        Password = [Uri]::UnescapeDataString($credentials[1])
        Database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    }
}

function Get-AlasleePostgresBackend {
    $command = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
    if ($command) { return [pscustomobject]@{ Mode='native'; Bin=(Split-Path -Parent $command.Source); Container=$null } }
    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
    $candidates = foreach ($root in $roots) {
        Get-ChildItem -Path (Join-Path $root 'PostgreSQL') -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            Get-Item -LiteralPath (Join-Path $_.FullName 'bin\psql.exe') -ErrorAction SilentlyContinue
        }
    }
    $selected = $candidates | Sort-Object FullName -Descending | Select-Object -First 1
    if ($selected) { return [pscustomobject]@{ Mode='native'; Bin=(Split-Path -Parent $selected.FullName); Container=$null } }
    if (Get-Command 'docker.exe' -ErrorAction SilentlyContinue) {
        $container = (& docker.exe ps --filter 'name=^/alaslee-crm-postgres$' --format '{{.Names}}' 2>$null | Select-Object -First 1)
        if ($container -eq 'alaslee-crm-postgres') { return [pscustomobject]@{ Mode='docker'; Bin=$null; Container=$container } }
    }
    throw 'Neither native PostgreSQL client tools nor the Alaslee PostgreSQL Docker container are available.'
}

function Invoke-AlasleePostgresTool($Backend, [string]$Name, [string[]]$Arguments) {
    if ($Backend.Mode -eq 'native') {
        $toolPath = Join-Path $Backend.Bin "$Name.exe"
        if (-not (Test-Path -LiteralPath $toolPath)) { throw "PostgreSQL tool was not found: $toolPath" }
        & $toolPath @Arguments
        return
    }
    $containerArguments = $Arguments | ForEach-Object {
        if ($_ -match '^--host=') { '--host=127.0.0.1' }
        elseif ($_ -match '^--port=') { '--port=5432' }
        else { $_ }
    }
    & docker.exe exec -e "PGPASSWORD=$env:PGPASSWORD" $Backend.Container $Name @containerArguments
}

function Export-AlasleePostgres($Backend, $Database, [string]$Destination) {
    $arguments = @('--no-password','--format=custom',"--host=$($Database.Host)","--port=$($Database.Port)","--username=$($Database.User)","--dbname=$($Database.Database)")
    if ($Backend.Mode -eq 'native') {
        Invoke-AlasleePostgresTool $Backend 'pg_dump' ($arguments + "--file=$Destination")
        return
    }
    $remotePath = '/tmp/alaslee-backup-' + [Guid]::NewGuid().ToString('N') + '.dump'
    $exitCode = 1
    try {
        Invoke-AlasleePostgresTool $Backend 'pg_dump' ($arguments + "--file=$remotePath")
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            & docker.exe cp "$($Backend.Container):$remotePath" $Destination
            $exitCode = $LASTEXITCODE
        }
    } finally {
        & docker.exe exec $Backend.Container rm -f $remotePath *> $null
        $global:LASTEXITCODE = $exitCode
    }
}

function Import-AlasleePostgres($Backend, $Admin, [string]$DatabaseName, [string]$Role, [string]$Source) {
    $arguments = @('--no-password','--exit-on-error','--no-owner',"--role=$Role", "--host=$($Admin.Host)","--port=$($Admin.Port)","--username=$($Admin.User)","--dbname=$DatabaseName")
    if ($Backend.Mode -eq 'native') {
        Invoke-AlasleePostgresTool $Backend 'pg_restore' ($arguments + $Source)
        return
    }
    $remotePath = '/tmp/alaslee-restore-' + [Guid]::NewGuid().ToString('N') + '.dump'
    $exitCode = 1
    try {
        & docker.exe cp $Source "$($Backend.Container):$remotePath"
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            Invoke-AlasleePostgresTool $Backend 'pg_restore' ($arguments + $remotePath)
            $exitCode = $LASTEXITCODE
        }
    } finally {
        & docker.exe exec $Backend.Container rm -f $remotePath *> $null
        $global:LASTEXITCODE = $exitCode
    }
}

function Set-AlasleeEnvironmentValue([string]$Path, [string]$Name, [string]$Value) {
    $content = [IO.File]::ReadAllText($Path)
    $pattern = '(?m)^' + [Regex]::Escape($Name) + '=.*$'
    $line = "$Name=$Value"
    if ([Regex]::IsMatch($content, $pattern)) { $content = [Regex]::Replace($content, $pattern, $line) }
    else { $content = $content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine }
    [IO.File]::WriteAllText($Path, $content, (New-Object Text.UTF8Encoding($false)))
}

function Assert-SafePostgresName([string]$Value, [string]$Label) {
    if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "$Label contains unsupported characters." }
}

function Assert-PathInside([string]$Parent, [string]$Child) {
    $resolvedParent = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $resolvedChild = [IO.Path]::GetFullPath($Child)
    if (-not $resolvedChild.StartsWith($resolvedParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe path outside expected root: $resolvedChild"
    }
}

function Get-AlasleeSha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}
