# Operación del esquema reconstruido; no certifica la base real.
$ErrorActionPreference = 'Stop'
function Initialize-Pg {
    foreach ($pair in @(@('PGHOST','DB_HOST'),@('PGPORT','DB_PORT'),@('PGUSER','DB_USER'),@('PGDATABASE','DB_NAME'))) {
        if (-not [Environment]::GetEnvironmentVariable($pair[0])) { [Environment]::SetEnvironmentVariable($pair[0], [Environment]::GetEnvironmentVariable($pair[1])) }
        if (-not [Environment]::GetEnvironmentVariable($pair[0])) { throw "$($pair[0]) o $($pair[1]) es obligatorio." }
    }
    if ($env:DB_PASSWORD_FILE) {
        try { $env:PGPASSWORD = [IO.File]::ReadAllText($env:DB_PASSWORD_FILE) -replace '\r?\n\z','' }
        catch { throw 'No se puede leer DB_PASSWORD_FILE; revise los permisos.' }
    }
    elseif ($env:DB_PASSWORD) { $env:PGPASSWORD = $env:DB_PASSWORD }
    $env:PGCONNECT_TIMEOUT = '10'
}
function Invoke-Pg([string]$Tool, [string[]]$PgArgs) {
    if ($env:PG_CONTAINER) {
        $result = & docker exec -i -e PGHOST -e PGPORT -e PGUSER -e PGDATABASE -e PGPASSWORD -e PGPASSFILE -e PGCONNECT_TIMEOUT $env:PG_CONTAINER $Tool @PgArgs 2>$null
    } else {
        $exe = if ($env:PG_BIN) { Join-Path $env:PG_BIN ($Tool + '.exe') } else { $Tool }
        $result = & $exe @PgArgs 2>$null
    }
    if ($LASTEXITCODE -ne 0) { throw "Falló $Tool. Revise conexión, permisos, versión y esquema (sin detalles ni secretos en el registro)." }
    return $result
}
function Test-DbName([string]$Name) { if ($Name -cnotmatch '\A[a-z][a-z0-9_]{0,62}\z') { throw 'Nombre de base inválido: use minúsculas, dígitos y guion bajo.' } }
function Get-Counts([string]$Name) {
    $tables = Invoke-Pg psql @('-X','-w','-d',$Name,'-At','-v','ON_ERROR_STOP=1','-c',"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
    foreach ($table in $tables) {
        # quote_ident desde el servidor, sin interpolar nombres SQL arbitrarios.
        $quoted = '"' + $table.Replace('"','""') + '"'
        $n = Invoke-Pg psql @('-X','-w','-d',$Name,'-At','-v','ON_ERROR_STOP=1','-c',"SELECT count(*) FROM public.$quoted")
        "$table`t$n"
    }
}
Initialize-Pg
