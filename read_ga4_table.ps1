$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52692
$connStr = "Data Source=localhost:$port;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($connStr)

try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "EVALUATE TOPN(25, 'MQ Hair – GA4')"
    $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
    $ds = New-Object System.Data.DataSet
    $adapter.Fill($ds) | Out-Null
    
    Write-Host "Colunas de MQ Hair – GA4:"
    foreach ($col in $ds.Tables[0].Columns) {
        Write-Host "  - $($col.ColumnName)"
    }
    
    Write-Host "`nPrimeiras linhas:"
    $ds.Tables[0] | Format-Table -AutoSize
} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
