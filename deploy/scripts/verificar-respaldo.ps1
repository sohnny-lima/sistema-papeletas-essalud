param([Parameter(Mandatory)][string]$Archivo)
. "$PSScriptRoot/comun.ps1"
$temp = 'bd_papeleta_tmp_verificar_' + [guid]::NewGuid().ToString('N')
$exists = Invoke-Pg psql @('-X','-w','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',"SELECT 1 FROM pg_database WHERE datname='$temp'")
if ($exists) { throw 'El nombre temporal ya existe; no se modificó.' }
$errorOriginal = $null
try {
    & "$PSScriptRoot/restaurar.ps1" -Archivo $Archivo -Destino $temp
    $expected = @(Get-Content -LiteralPath "$Archivo.counts" | Where-Object { $_ })
    $actual = @(Get-Counts $temp)
    if (Compare-Object $expected $actual) { throw 'Los recuentos por tabla no coinciden con el manifiesto del respaldo.' }
    $actual
    Write-Output 'Respaldo verificado: recuentos por tabla coincidentes.'
} catch { $errorOriginal = $_; throw }
finally {
    try { Invoke-Pg dropdb @('-w','--if-exists',$temp) | Out-Null }
    catch {
        if (-not $errorOriginal) { throw }
        Write-Warning 'No se pudo borrar la base temporal; se conserva el error original. Revise las bases bd_papeleta_tmp_verificar_.'
    }
}
