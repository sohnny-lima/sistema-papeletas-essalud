param([Parameter(Mandatory)][string]$Archivo)
. "$PSScriptRoot/comun.ps1"
if ($env:PG_CONTAINER) {
    $remote = '/tmp/esquema-' + [guid]::NewGuid().ToString('N') + '.sql'
    try {
        Invoke-Pg pg_dump @('-w','--schema-only','--no-owner','--no-privileges','-f',$remote) | Out-Null
        & docker cp "${env:PG_CONTAINER}:$remote" $Archivo 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el esquema.' }
    } finally { & docker exec $env:PG_CONTAINER rm -f $remote 2>$null }
} else { Invoke-Pg pg_dump @('-w','--schema-only','--no-owner','--no-privileges','-f',$Archivo) | Out-Null }
Write-Output 'Esquema exportado. Comparar con la referencia reconstruida; no equivale a validar la base real.'
