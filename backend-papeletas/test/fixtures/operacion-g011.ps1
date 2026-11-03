param([Parameter(Mandatory)][string]$Directorio)
# g011 #5/#6: fallos simulados; no conecta con ninguna base ni contenedor.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot/../../..").Path
$env:PG_CONTAINER = 'g011_simulado'
$env:DB_PASSWORD_FILE = ''
$env:G011_MODO = 'recuento'
function global:docker {
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'cp' -and $args[1] -like 'g011_simulado:*') { [IO.File]::WriteAllText($args[2], 'volcado_ficticio'); return }
    if ($args -contains 'psql' -and $env:G011_MODO -eq 'recuento') { $global:LASTEXITCODE = 1; return }
    if ($args -contains 'pg_restore' -or $args -contains 'dropdb') { $global:LASTEXITCODE = 1 }
}
$salida = Join-Path $Directorio 'salida'
New-Item -ItemType Directory -Force -Path $salida | Out-Null
$fallo = $false
try { & "$repo/deploy/scripts/respaldo.ps1" -Directorio $salida }
catch { $fallo = $true; if ($_.Exception.Message -notmatch 'Respaldo incompleto') { throw } }
if (-not $fallo -or @(Get-ChildItem -LiteralPath $salida).Count) { throw 'g011 #5: quedaron archivos de un respaldo incompleto.' }
Write-Output 'g011 #5 OK: fallo de recuento después del volcado elimina dump, counts y sha256.'
$env:G011_MODO = 'restauracion'
$file = Join-Path $Directorio 'fixture.dump'
[IO.File]::WriteAllText($file, 'volcado_ficticio')
(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() | Set-Content -LiteralPath "$file.sha256" -Encoding ascii
$fallo = $false
try { & "$repo/deploy/scripts/verificar-respaldo.ps1" -Archivo $file }
catch {
    $fallo = $true
    if ($_.Exception.Message -notmatch 'Falló pg_restore') { throw 'g011 #6: la limpieza ocultó el error original de pg_restore.' }
}
if (-not $fallo) { throw 'g011 #6: faltó el fallo simulado.' }
Write-Output 'g011 #6 OK: fallos de dropdb en ambos finally conservan el error original de pg_restore.'
