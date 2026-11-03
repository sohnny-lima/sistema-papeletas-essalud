param([Parameter(Mandatory)][string]$Directorio, [int]$RetencionDias = 14)
. "$PSScriptRoot/comun.ps1"
if ($RetencionDias -lt 1) { throw 'La retención debe ser de al menos un día.' }
Test-DbName $env:PGDATABASE
$dir = [IO.Path]::GetFullPath($Directorio)
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$file = Join-Path $dir ("papeletas-$($env:PGDATABASE)-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$([guid]::NewGuid().ToString('N').Substring(0,8)).dump")
try {
    if ($env:PG_CONTAINER) {
        # El formato custom es binario: no pasa por el pipeline textual de PowerShell.
        $remote = '/tmp/' + [IO.Path]::GetFileName($file)
        try {
            Invoke-Pg pg_dump @('-w','-Fc','-f',$remote) | Out-Null
            & docker cp "${env:PG_CONTAINER}:$remote" $file 2>$null
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el respaldo del contenedor.' }
        } finally { & docker exec $env:PG_CONTAINER rm -f $remote 2>$null }
    } else { Invoke-Pg pg_dump @('-w','-Fc','-f',$file) | Out-Null }
    @(Get-Counts $env:PGDATABASE) | Set-Content -LiteralPath "$file.counts" -Encoding utf8
    ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()) | Set-Content -LiteralPath "$file.sha256" -Encoding ascii
    Get-ChildItem -LiteralPath $dir -Filter "papeletas-$($env:PGDATABASE)-*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetencionDias) } | ForEach-Object {
        foreach ($old in @($_.FullName, "$($_.FullName).sha256", "$($_.FullName).counts")) { if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old } }
    }
    Write-Output $file
} catch {
    foreach ($incompleto in @($file, "$file.counts", "$file.sha256")) {
        if (Test-Path -LiteralPath $incompleto) {
            try { Remove-Item -LiteralPath $incompleto -ErrorAction Stop }
            catch { Write-Warning 'No se pudo eliminar un archivo incompleto; revise el directorio de respaldo.' }
        }
    }
    throw 'Respaldo incompleto eliminado. Revise conexión, permisos y espacio disponible.'
}
