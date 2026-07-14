param(
    [string]$EnvironmentFile = '.env',
    [string]$AdminDatabaseUrl = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$environmentPath = Resolve-AlasleePath $projectRoot $EnvironmentFile
$values = Get-AlasleeEnvironment $environmentPath
$applicationDatabase = Get-AlasleeDatabaseParts $values.CRM_DATABASE_URL
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

$suffix = (Get-Date -Format 'yyyyMMddHHmmss') + ([Guid]::NewGuid().ToString('N').Substring(0,6))
$databaseName = "alaslee_test_$suffix"
Assert-SafePostgresName $databaseName 'Temporary database name'
Assert-SafePostgresName $applicationDatabase.User 'Application database user'
$tempRoot = [IO.Path]::GetFullPath((Join-Path $env:TEMP "alaslee-production-test-$suffix"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $admin.Password
$failure = $null
$steps = [System.Collections.Generic.List[object]]::new()

function Invoke-TestStep([string]$Name, [scriptblock]$Action, [System.Collections.Generic.List[object]]$Results) {
    $started = Get-Date
    & $Action
    $exitCode = $LASTEXITCODE
    $duration = [Math]::Round(((Get-Date) - $started).TotalSeconds, 2)
    $Results.Add([pscustomobject]@{ name=$Name; ok=($exitCode -eq 0); exitCode=$exitCode; durationSeconds=$duration })
    if ($exitCode -ne 0) { throw "Production test step failed: $Name (exit $exitCode)" }
}

try {
    Invoke-AlasleePostgresTool $backend 'createdb' @('--no-password',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)","--owner=$($applicationDatabase.User)",$databaseName)
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated production test database.' }
    $encodedPassword = [Uri]::EscapeDataString($applicationDatabase.Password)
    $testDatabaseUrl = "postgresql://$($applicationDatabase.User):$encodedPassword@$($applicationDatabase.Host):$($applicationDatabase.Port)/$databaseName"
    $workspaceSource = Resolve-AlasleePath $projectRoot $values.ORIGINALEYE_DATA_ROOT
    $workspaceTarget = Join-Path $tempRoot 'OriginalEye-Data-Analysis'
    Copy-Item -LiteralPath $workspaceSource -Destination $workspaceTarget -Recurse -Force
    New-Item -ItemType Directory -Force -Path (Join-Path $tempRoot 'uploads'), (Join-Path $tempRoot 'data') | Out-Null

    $env:ENV_FILE = $environmentPath
    $env:NODE_ENV = 'test'
    $env:CRM_DATABASE_URL = $testDatabaseUrl
    $env:CRM_TEST_DATABASE_URL = $testDatabaseUrl
    $env:CRM_STAFF_PIN = $values.CRM_STAFF_PIN
    $env:CRM_SUPERUSER_PIN = $values.CRM_SUPERUSER_PIN
    $env:CRM_SECURE_COOKIE = 'false'
    $env:CRM_LOGIN_RATE_LIMIT_DISABLED = 'false'
    $env:DATABASE_PATH = Join-Path $tempRoot 'data\products.sqlite'
    $env:UPLOADS_DIR = Join-Path $tempRoot 'uploads'
    $env:ORIGINALEYE_DATA_ROOT = $workspaceTarget
    $env:ALLOWED_IMPORT_ROOTS = $tempRoot
    $env:BRAND_BACKGROUND_PATH = Join-Path $projectRoot 'background.png'
    $env:BRAND_LOGO_PATH = Join-Path $projectRoot 'Logo.png'
    $env:BRAND_FOOTER_PATH = Join-Path $projectRoot 'footer.png'
    $env:BRAND_PRICE_LABEL_REFERENCE_PATH = Join-Path $projectRoot 'Label.png'

    Invoke-TestStep 'syntax' { & node.exe (Join-Path $PSScriptRoot 'check-syntax.js') } $steps
    Invoke-TestStep 'audit' { & npm.cmd audit --audit-level=high } $steps
    Invoke-TestStep 'build' { & npm.cmd run build } $steps
    Invoke-TestStep 'node-tests' { & node.exe --test --test-concurrency=1 } $steps
    Invoke-TestStep 'branding-composition' { & node.exe (Join-Path $PSScriptRoot 'verify-branding-composition.js') } $steps
    Invoke-TestStep 'excel-import' { & node.exe (Join-Path $PSScriptRoot 'import-crm-history-once.js') } $steps
    Invoke-TestStep 'daftra-read-only-sync' { & node.exe (Join-Path $PSScriptRoot 'sync-daftra-once.js') } $steps
    $env:NODE_ENV = 'production'
    Invoke-TestStep 'preflight' { & node.exe (Join-Path $PSScriptRoot 'production-preflight.js') } $steps
    Invoke-TestStep 'http-smoke' { & node.exe (Join-Path $PSScriptRoot 'production-http-smoke.js') } $steps
    Invoke-TestStep 'browser-e2e' { & npm.cmd run test:e2e } $steps
} catch {
    $failure = $_
} finally {
    $env:PGPASSWORD = $admin.Password
    Invoke-AlasleePostgresTool $backend 'dropdb' @('--no-password','--if-exists','--force',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)",$databaseName) 2>$null
    if (Test-Path -LiteralPath $tempRoot) {
        Assert-PathInside $env:TEMP $tempRoot
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
    if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPassword }
    $diagnostics = Join-Path $projectRoot 'diagnostics'
    New-Item -ItemType Directory -Force -Path $diagnostics | Out-Null
    $report = [ordered]@{ ok = ($null -eq $failure); completedAt = (Get-Date).ToUniversalTime().ToString('o'); isolatedDatabaseRemoved = $true; temporaryFilesRemoved = -not (Test-Path -LiteralPath $tempRoot); steps = @($steps) }
    [IO.File]::WriteAllText((Join-Path $diagnostics 'production-test.json'), ($report | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
}

if ($failure) { throw $failure }
Write-Host 'Isolated production test suite passed.' -ForegroundColor Green
