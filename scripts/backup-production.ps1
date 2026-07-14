param(
    [string]$EnvironmentFile = '.env',
    [string]$Destination = 'backups',
    [int]$RetentionDays = 14
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$environmentPath = Resolve-AlasleePath $projectRoot $EnvironmentFile
$values = Get-AlasleeEnvironment $environmentPath
$applicationDatabase = Get-AlasleeDatabaseParts $values.CRM_DATABASE_URL
$backupCredentials = $applicationDatabase
if ($values.ContainsKey('CRM_POSTGRES_ADMIN_URL') -and $values.CRM_POSTGRES_ADMIN_URL) {
    $backupCredentials = Get-AlasleeDatabaseParts $values.CRM_POSTGRES_ADMIN_URL
} elseif ($env:CRM_POSTGRES_ADMIN_URL) {
    $backupCredentials = Get-AlasleeDatabaseParts $env:CRM_POSTGRES_ADMIN_URL
}
if ($backupCredentials.Host -ne $applicationDatabase.Host -or $backupCredentials.Port -ne $applicationDatabase.Port) {
    throw 'CRM_POSTGRES_ADMIN_URL must point to the same PostgreSQL server as CRM_DATABASE_URL.'
}
$database = [pscustomobject]@{
    Host = $applicationDatabase.Host
    Port = $applicationDatabase.Port
    User = $backupCredentials.User
    Password = $backupCredentials.Password
    Database = $applicationDatabase.Database
}
$backupRoot = Resolve-AlasleePath $projectRoot $Destination
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupRoot $timestamp
Assert-PathInside $backupRoot $backupPath
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null

$backend = Get-AlasleePostgresBackend
$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $database.Password
$backupCompleted = $false
try {
    $dumpPath = Join-Path $backupPath 'crm.dump'
    Export-AlasleePostgres $backend $database $dumpPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $dumpPath -PathType Leaf)) { throw "PostgreSQL backup failed with exit code $LASTEXITCODE." }

    $sqliteSource = Resolve-AlasleePath $projectRoot $values.DATABASE_PATH
    & node.exe (Join-Path $PSScriptRoot 'sqlite-backup.js') backup $sqliteSource (Join-Path $backupPath 'products.sqlite')
    if ($LASTEXITCODE -ne 0) { throw "SQLite backup failed with exit code $LASTEXITCODE." }

    $contentRoot = Join-Path $backupPath 'content'
    New-Item -ItemType Directory -Force -Path $contentRoot | Out-Null
    foreach ($entry in @(
        @{ Name = 'uploads'; Value = $values.UPLOADS_DIR },
        @{ Name = 'OriginalEye-Data-Analysis'; Value = $values.ORIGINALEYE_DATA_ROOT }
    )) {
        $source = Resolve-AlasleePath $projectRoot $entry.Value
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $contentRoot $entry.Name) -Recurse -Force }
    }

    $brandingRoot = Join-Path $contentRoot 'branding-source'
    New-Item -ItemType Directory -Force -Path $brandingRoot | Out-Null
    foreach ($name in @('BRAND_BACKGROUND_PATH','BRAND_LOGO_PATH','BRAND_FOOTER_PATH','BRAND_PRICE_LABEL_REFERENCE_PATH')) {
        $source = Resolve-AlasleePath $projectRoot $values[$name]
        if ($source -and (Test-Path -LiteralPath $source -PathType Leaf)) { Copy-Item -LiteralPath $source -Destination $brandingRoot -Force }
    }

    $files = Get-ChildItem -LiteralPath $backupPath -Recurse -File | Where-Object { $_.Name -ne 'manifest.json' } | ForEach-Object {
        [pscustomobject]@{
            path = $_.FullName.Substring($backupPath.Length + 1).Replace('\','/')
            bytes = $_.Length
            sha256 = Get-AlasleeSha256 $_.FullName
        }
    }
    $manifest = [ordered]@{
        version = 1
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        database = $database.Database
        environmentIncluded = $false
        encryptionKeyIncluded = $false
        files = @($files)
    }
    [IO.File]::WriteAllText((Join-Path $backupPath 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
    $backupCompleted = $true
} finally {
    if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPassword }
    if (-not $backupCompleted -and (Test-Path -LiteralPath $backupPath)) {
        Assert-PathInside $backupRoot $backupPath
        Remove-Item -LiteralPath $backupPath -Recurse -Force
    }
}

if ($RetentionDays -gt 0 -and (Test-Path -LiteralPath $backupRoot)) {
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    foreach ($directory in Get-ChildItem -LiteralPath $backupRoot -Directory | Where-Object { $_.Name -match '^\d{8}-\d{6}$' -and $_.LastWriteTime -lt $cutoff }) {
        Assert-PathInside $backupRoot $directory.FullName
        Remove-Item -LiteralPath $directory.FullName -Recurse -Force
    }
}

Write-Host "Production backup completed: $backupPath" -ForegroundColor Green
Write-Warning 'The .env file and CRM encryption key are intentionally excluded. Keep a separate encrypted recovery copy.'
