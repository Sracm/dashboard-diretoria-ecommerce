$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52456
$connStr = "Data Source=localhost:$port;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($connStr)

try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT [COLUMN_NAME] FROM `$SYSTEM.TMSCHEMA_COLUMNS WHERE [TABLE_ID] = (SELECT [ID] FROM `$SYSTEM.TMSCHEMA_TABLES WHERE [NAME] = 'Consulta1')"
    $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
    $ds = New-Object System.Data.DataSet
    $adapter.Fill($ds) | Out-Null
    
    foreach ($r in $ds.Tables[0].Rows) {
        Write-Host $r[0]
    }

} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
