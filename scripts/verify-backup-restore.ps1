param(
    [string]$EnvironmentFile = '.env',
    [string]$BackupPath = '',
    [string]$AdminDatabaseUrl = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$values = Get-AlasleeEnvironment (Resolve-AlasleePath $projectRoot $EnvironmentFile)
$applicationDatabase = Get-AlasleeDatabaseParts $values.CRM_DATABASE_URL
if (-not $BackupPath) {
    $BackupPath = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'backups') -Directory | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
}
$BackupPath = [IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath (Join-Path $BackupPath 'manifest.json'))) { throw "Backup manifest was not found: $BackupPath" }

$manifest = Get-Content -LiteralPath (Join-Path $BackupPath 'manifest.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $filePath = Join-Path $BackupPath ([string]$entry.path).Replace('/', '\')
    Assert-PathInside $BackupPath $filePath
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) { throw "Backup file is missing: $($entry.path)" }
    $hash = Get-AlasleeSha256 $filePath
    if ($hash -ne $entry.sha256) { throw "Backup checksum mismatch: $($entry.path)" }
}

$backend = Get-AlasleePostgresBackend
if ($AdminDatabaseUrl) {
    $admin = Get-AlasleeDatabaseParts $AdminDatabaseUrl
} elseif ($values.ContainsKey('CRM_POSTGRES_ADMIN_URL') -and $values.CRM_POSTGRES_ADMIN_URL) {
    $admin = Get-AlasleeDatabaseParts $values.CRM_POSTGRES_ADMIN_URL
} elseif ($env:CRM_POSTGRES_ADMIN_URL) {
    $admin = Get-AlasleeDatabaseParts $env:CRM_POSTGRES_ADMIN_URL
} elseif ($backend.Mode -eq 'docker') {
    $admin = [pscustomobject]@{ Host=$applicationDatabase.Host; Port=$applicationDatabase.Port; User=$applicationDatabase.User; Password=$applicationDatabase.Password; Database='postgres' }
} else {
    $admin = [pscustomobject]@{ Host=$applicationDatabase.Host; Port=$applicationDatabase.Port; User='postgres'; Password=$values.CRM_POSTGRES_PASSWORD; Database='postgres' }
}
$databaseName = 'alaslee_restore_' + (Get-Date -Format 'yyyyMMddHHmmss')
Assert-SafePostgresName $databaseName 'Temporary database name'
Assert-SafePostgresName $applicationDatabase.User 'Application database user'
$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $admin.Password

try {
    Invoke-AlasleePostgresTool $backend 'createdb' @('--no-password',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)","--owner=$($applicationDatabase.User)",$databaseName)
    if ($LASTEXITCODE -ne 0) { throw "Could not create the temporary restore database." }
    Import-AlasleePostgres $backend $admin $databaseName $applicationDatabase.User (Join-Path $BackupPath 'crm.dump')
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL restore verification failed." }
    $migrationCount = (Invoke-AlasleePostgresTool $backend 'psql' @('--no-password',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)","--dbname=$databaseName",'-tAc','SELECT count(*) FROM crm_schema_migrations')).Trim()
    if ([int]$migrationCount -lt 8) { throw "Restored CRM database is missing migrations." }
    & node.exe (Join-Path $PSScriptRoot 'sqlite-backup.js') verify (Join-Path $BackupPath 'products.sqlite')
    if ($LASTEXITCODE -ne 0) { throw "SQLite restore verification failed." }
    Write-Host "Backup restore verification passed: $BackupPath" -ForegroundColor Green
} finally {
    Invoke-AlasleePostgresTool $backend 'dropdb' @('--no-password','--if-exists','--force',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)",$databaseName) 2>$null
    if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPassword }
}
