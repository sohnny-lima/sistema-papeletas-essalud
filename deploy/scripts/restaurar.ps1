param([Parameter(Mandatory)][string]$Archivo, [Parameter(Mandatory)][string]$Destino, [switch]$Reemplazar, [string]$Confirmacion)
. "$PSScriptRoot/comun.ps1"
Test-DbName $Destino
if ($Destino -in @('postgres','template0','template1','bd_papeleta_test')) { throw 'Destino protegido: restauración rechazada.' }
if (-not (Test-Path -LiteralPath "$Archivo.sha256" -PathType Leaf)) { throw 'Falta el archivo de suma SHA-256 del respaldo.' }
# Se admite un único salto final, sin recortar espacios ni saltos internos.
$hash = (Get-Content -LiteralPath "$Archivo.sha256" -Raw) -replace '\r?\n\z',''
if ($hash -cnotmatch '\A[a-fA-F0-9]{64}\z' -or $hash.ToLowerInvariant() -cne (Get-FileHash -LiteralPath $Archivo -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Suma SHA-256 incorrecta.' }
$exists = Invoke-Pg psql @('-X','-w','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',"SELECT 1 FROM pg_database WHERE datname='$Destino'")
if ($exists -eq '1' -and (-not $Reemplazar -or $Confirmacion -cne "REEMPLAZAR $Destino")) { throw 'La base existe. Requiere -Reemplazar -Confirmacion "REEMPLAZAR nombre".' }
if ($Reemplazar -and $Confirmacion -cne "REEMPLAZAR $Destino") { throw 'Confirmación incorrecta.' }
# Se acorta el prefijo para respetar el máximo de 63 bytes de PostgreSQL.
$temp = $Destino.Substring(0, [Math]::Min(34, $Destino.Length)) + '_restaurando_' + [guid]::NewGuid().ToString('N').Substring(0,16)
$anterior = $Destino.Substring(0, [Math]::Min(37, $Destino.Length)) + '_anterior_' + [guid]::NewGuid().ToString('N').Substring(0,16)
Test-DbName $temp
Test-DbName $anterior
$creada = $false
$errorOriginal = $null
$remote = $null
try {
    Invoke-Pg createdb @('-w','-T','template0',$temp) | Out-Null
    $creada = $true
    if ($env:PG_CONTAINER) {
        $remote = '/tmp/restaurar-' + [guid]::NewGuid().ToString('N') + '.dump'
        & docker cp $Archivo "${env:PG_CONTAINER}:$remote" 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el respaldo al contenedor.' }
        Invoke-Pg pg_restore @('-w','--no-owner','--exit-on-error','--single-transaction','-d',$temp,$remote) | Out-Null
    } else { Invoke-Pg pg_restore @('-w','--no-owner','--exit-on-error','--single-transaction','-d',$temp,$Archivo) | Out-Null }
    # Ambos renombrados se confirman juntos: un fallo conserva el destino original.
    # Requiere cerrar conexiones al destino (detener el backend previamente).
    $sql = 'BEGIN; '
    if ($exists -eq '1') { $sql += "ALTER DATABASE `"$Destino`" RENAME TO `"$anterior`"; " }
    $sql += "ALTER DATABASE `"$temp`" RENAME TO `"$Destino`"; COMMIT;"
    Invoke-Pg psql @('-X','-w','-d','postgres','-v','ON_ERROR_STOP=1','-c',$sql) | Out-Null
    $creada = $false
    if ($exists -eq '1') {
        try { Invoke-Pg dropdb @('-w',$anterior) | Out-Null }
        catch { Write-Warning "La restauración terminó, pero no se pudo borrar la copia anterior $anterior. Revise su eliminación." }
    }
    Write-Output "Restauración completada: $Destino"
} catch { $errorOriginal = $_; throw }
finally {
    if ($remote) {
        try { & docker exec $env:PG_CONTAINER rm -f $remote 2>$null }
        catch { Write-Warning 'No se pudo limpiar el archivo temporal del contenedor.' }
    }
    if ($creada) {
        try { Invoke-Pg dropdb @('-w','--if-exists',$temp) | Out-Null }
        catch {
            if (-not $errorOriginal) { throw }
            Write-Warning "No se pudo borrar la base temporal $temp; se conserva el error original."
        }
    }
}
