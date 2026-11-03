<#
.SYNOPSIS
  Crea un clúster PostgreSQL desechable y carga el esquema inferido y los datos de prueba.

.DESCRIPTION
  No toca los servicios PostgreSQL instalados: crea un clúster nuevo en -DataDir,
  con autenticación "trust" solo en localhost, y lo arranca en -Port.
  Úsalo únicamente para desarrollo y pruebas.

.EXAMPLE
  .\docs\revision\pruebas\preparar-bd-prueba.ps1
  .\docs\revision\pruebas\preparar-bd-prueba.ps1 -Reset      # borra y recrea la base
  .\docs\revision\pruebas\preparar-bd-prueba.ps1 -Stop       # detiene el clúster
#>
param(
  [string]$PgBin   = "C:\Program Files\PostgreSQL\17\bin",
  [string]$DataDir = "$env:TEMP\papeletas-pg-test",
  [int]   $Port    = 55432,
  [string]$DbName  = "bd_papeleta_test",
  [switch]$Reset,
  [switch]$Stop
)
$ErrorActionPreference = 'Stop'
if ($DbName -cnotmatch '\A[a-z][a-z0-9_]{0,62}\z' -or $Port -lt 1 -or $Port -gt 65535) { throw 'Nombre de base o puerto inválido.' }
$sqlDir = Join-Path $PSScriptRoot '..\..\..\backend-papeletas\db'
$psql   = Join-Path $PgBin 'psql.exe'
$pgctl  = Join-Path $PgBin 'pg_ctl.exe'
$initdb = Join-Path $PgBin 'initdb.exe'

if (-not (Test-Path $psql)) { throw "No se encontró psql en '$PgBin'. Indique -PgBin." }

if ($Stop) { & $pgctl -D $DataDir stop; if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener el clúster indicado.' }; return }

if (-not (Test-Path (Join-Path $DataDir 'PG_VERSION'))) {
  & $initdb -D $DataDir -U postgres -A trust -E UTF8 --locale=C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar el clúster de pruebas.' }
}

& $pgctl -D $DataDir status *> $null
if ($LASTEXITCODE -ne 0) {
  # Esperar solo a pg_ctl, sin que PowerShell espere también al servidor descendiente.
  # Los argumentos se pasan separados, incluso si DataDir contiene espacios.
  $inicio = [Diagnostics.ProcessStartInfo]::new()
  $inicio.FileName = $pgctl
  $inicio.UseShellExecute = $false
  $inicio.CreateNoWindow = $true
  foreach ($arg in @('-D', $DataDir, '-o', "-p $Port -c listen_addresses=localhost", '-l', (Join-Path $DataDir 'server.log'), '-w', 'start')) { $inicio.ArgumentList.Add($arg) }
  $proceso = [Diagnostics.Process]::Start($inicio)
  if (-not $proceso.WaitForExit(60000) -or $proceso.ExitCode -ne 0) { throw 'No se pudo arrancar el clúster de pruebas.' }
  $proceso.Dispose()
}

$exists = & $psql -h localhost -p $Port -U postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$DbName'"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el clúster de pruebas.' }
if ($exists -eq '1' -and $Reset) {
  & $psql -h localhost -p $Port -U postgres -q -c "DROP DATABASE $DbName"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo borrar la base de pruebas.' }
  $exists = $null
}
if ($exists -ne '1') {
  & $psql -h localhost -p $Port -U postgres -q -c "CREATE DATABASE $DbName"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base de pruebas.' }
  # Orden: esquema inferido -> migraciones (por nombre) -> datos de prueba
  $files = @(Join-Path $sqlDir 'esquema/001_esquema_inicial.sql')
  $migDir = Join-Path $sqlDir 'migraciones'
  if (Test-Path $migDir) {
    $files += Get-ChildItem $migDir -Filter *.sql | Sort-Object Name | ForEach-Object FullName
  }
  $files += Join-Path $sqlDir 'demo/datos-demo.sql'
  foreach ($f in $files) {
    & $psql -h localhost -p $Port -U postgres -d $DbName -q -v ON_ERROR_STOP=1 -f $f | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falló al aplicar $f" }
  }
  Write-Host "Base '$DbName' creada en localhost:$Port ($($files.Count) scripts aplicados)"
} else {
  Write-Host "Base '$DbName' ya existe en localhost:$Port (use -Reset para recrearla)"
}
