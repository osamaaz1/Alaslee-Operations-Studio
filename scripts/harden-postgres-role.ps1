param([string]$EnvironmentFile = '.env')

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env-utils.ps1')
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$environmentPath = Resolve-AlasleePath $projectRoot $EnvironmentFile
$values = Get-AlasleeEnvironment $environmentPath
$database = Get-AlasleeDatabaseParts $values.CRM_DATABASE_URL
$backend = Get-AlasleePostgresBackend
Assert-SafePostgresName $database.User 'CRM_POSTGRES_USER'
Assert-SafePostgresName $database.Database 'CRM_POSTGRES_DB'
$previousPassword = $env:PGPASSWORD
$finalApplicationUser = $database.User

try {
    if ($values.ContainsKey('CRM_POSTGRES_ADMIN_URL') -and $values.CRM_POSTGRES_ADMIN_URL) {
        $admin = Get-AlasleeDatabaseParts $values.CRM_POSTGRES_ADMIN_URL
    } else {
        $env:PGPASSWORD = $database.Password
        $isSuperuser = (Invoke-AlasleePostgresTool $backend 'psql' @('--no-password',"--host=$($database.Host)","--port=$($database.Port)","--username=$($database.User)",'--dbname=postgres','-tAc','SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).Trim()
        if ($isSuperuser -ne 't') {
            throw 'The application role is already restricted, but CRM_POSTGRES_ADMIN_URL is missing. Supply an administrator URL before continuing.'
        }
        $adminUser = "$($database.User)_admin"
        Assert-SafePostgresName $adminUser 'Generated administrator role'
        $bytes = New-Object byte[] 24
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
        $adminPassword = ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
        $escapedPassword = $adminPassword.Replace("'", "''")
        $createSql = "DO `$alaslee`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='$adminUser') THEN CREATE ROLE `"$adminUser`" LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD '$escapedPassword'; ELSE ALTER ROLE `"$adminUser`" WITH LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD '$escapedPassword'; END IF; END `$alaslee`$;"
        Invoke-AlasleePostgresTool $backend 'psql' @('--no-password',"--host=$($database.Host)","--port=$($database.Port)","--username=$($database.User)",'--dbname=postgres','-v','ON_ERROR_STOP=1','-c',$createSql) | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the separate PostgreSQL administrator role.' }
        $encodedPassword = [Uri]::EscapeDataString($adminPassword)
        $adminUrl = "postgresql://${adminUser}:$encodedPassword@$($database.Host):$($database.Port)/postgres"
        Set-AlasleeEnvironmentValue $environmentPath 'CRM_POSTGRES_ADMIN_URL' $adminUrl
        $admin = Get-AlasleeDatabaseParts $adminUrl
    }

    $env:PGPASSWORD = $admin.Password
    $roleState = (Invoke-AlasleePostgresTool $backend 'psql' @('--no-password',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)",'--dbname=postgres','-tAc',"SELECT oid::text || ':' || rolsuper::text FROM pg_roles WHERE rolname='$($database.User)'" )).Trim()
    if (-not $roleState) { throw 'The configured PostgreSQL application role does not exist.' }
    $roleParts = $roleState.Split(':', 2)
    if ($roleParts[0] -eq '10') {
        # PostgreSQL never allows the initdb/bootstrap role (OID 10) to lose
        # SUPERUSER. Move the application to a separate least-privilege owner.
        $finalApplicationUser = "$($database.User)_app"
        Assert-SafePostgresName $finalApplicationUser 'Generated application role'
        $bytes = New-Object byte[] 24
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
        $applicationPassword = ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
        $escapedApplicationPassword = $applicationPassword.Replace("'", "''")
        $createApplicationSql = "DO `$alaslee`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='$finalApplicationUser') THEN CREATE ROLE `"$finalApplicationUser`" LOGIN PASSWORD '$escapedApplicationPassword' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; ELSE ALTER ROLE `"$finalApplicationUser`" WITH LOGIN PASSWORD '$escapedApplicationPassword' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; END IF; END `$alaslee`$; ALTER DATABASE `"$($database.Database)`" OWNER TO `"$finalApplicationUser`"; REVOKE CONNECT ON DATABASE `"$($database.Database)`" FROM PUBLIC; GRANT CONNECT ON DATABASE `"$($database.Database)`" TO `"$finalApplicationUser`";"
        Invoke-AlasleePostgresTool $backend 'psql' @('--no-password',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)",'--dbname=postgres','-v','ON_ERROR_STOP=1','-c',$createApplicationSql) | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the restricted PostgreSQL application role.' }
        $transferSql = @"
DO `$alaslee`$
DECLARE item record; objectKind text;
BEGIN
  FOR item IN
    SELECT c.relkind,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') AND pg_get_userbyid(c.relowner)='$($database.User)'
  LOOP
    objectKind := CASE item.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END;
    EXECUTE format('ALTER %s %I.%I OWNER TO %I',objectKind,item.nspname,item.relname,'$finalApplicationUser');
  END LOOP;
  FOR item IN
    SELECT p.oid::regprocedure::text AS identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND pg_get_userbyid(p.proowner)='$($database.User)'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I',item.identity,'$finalApplicationUser');
  END LOOP;
END `$alaslee`$;
ALTER SCHEMA public OWNER TO `"$finalApplicationUser`";
GRANT ALL ON SCHEMA public TO `"$finalApplicationUser`";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO `"$finalApplicationUser`";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO `"$finalApplicationUser`";
"@
        Invoke-AlasleePostgresTool $backend 'psql' @('--no-password',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)","--dbname=$($database.Database)",'-v','ON_ERROR_STOP=1','-c',$transferSql) | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Could not transfer CRM objects to the restricted application role.' }
        $encodedApplicationPassword = [Uri]::EscapeDataString($applicationPassword)
        Set-AlasleeEnvironmentValue $environmentPath 'CRM_DATABASE_URL' "postgresql://${finalApplicationUser}:$encodedApplicationPassword@$($database.Host):$($database.Port)/$($database.Database)"
    } else {
        $sql = "ALTER ROLE `"$($database.User)`" NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; REVOKE CONNECT ON DATABASE `"$($database.Database)`" FROM PUBLIC; GRANT CONNECT ON DATABASE `"$($database.Database)`" TO `"$($database.User)`";"
        Invoke-AlasleePostgresTool $backend 'psql' @('--no-password',"--host=$($admin.Host)","--port=$($admin.Port)","--username=$($admin.User)",'--dbname=postgres','-v','ON_ERROR_STOP=1','-c',$sql) | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Could not harden the PostgreSQL application role.' }
    }
} finally {
    if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPassword }
}
Write-Host "PostgreSQL application role hardened: $finalApplicationUser" -ForegroundColor Green
