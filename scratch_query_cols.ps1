$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52456
$connStr = "Data Source=localhost:$port;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($connStr)

try {
    $conn.Open()
    Write-Host "Conectado SSAS porta $port"

    # Query columns
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT [TABLE_NAME], [COLUMN_NAME] FROM `$SYSTEM.DBSCHEMA_COLUMNS WHERE [TABLE_NAME] = 'Consulta1' OR [TABLE_NAME] = 'dCalendario'"
    $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
    $ds = New-Object System.Data.DataSet
    $adapter.Fill($ds) | Out-Null
    
    foreach ($r in $ds.Tables[0].Rows) {
        Write-Host "$($r['TABLE_NAME']).$($r['COLUMN_NAME'])"
    }

} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
