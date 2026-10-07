$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52692
$connStr = "Data Source=localhost:$port;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($connStr)

try {
    $conn.Open()
    
    # 1. Tabelas
    $cmdT = $conn.CreateCommand()
    $cmdT.CommandText = "SELECT [ID], [NAME] FROM `$SYSTEM.TMSCHEMA_TABLES"
    $adT = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmdT)
    $dsT = New-Object System.Data.DataSet
    $adT.Fill($dsT) | Out-Null
    
    $tableMap = @{}
    foreach ($r in $dsT.Tables[0].Rows) {
        $tableMap[$r["ID"]] = $r["NAME"]
    }
    
    # 2. Partitions (M Queries)
    $cmdP = $conn.CreateCommand()
    $cmdP.CommandText = "SELECT [TABLE_ID], [NAME], [QUERYDEFINITION] FROM `$SYSTEM.TMSCHEMA_PARTITIONS"
    $adP = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmdP)
    $dsP = New-Object System.Data.DataSet
    $adP.Fill($dsP) | Out-Null
    
    Write-Host "=== CONSULTAS POWER QUERY (M) EXTRAÍDAS ==="
    foreach ($r in $dsP.Tables[0].Rows) {
        $tName = $tableMap[$r["TABLE_ID"]]
        if ($tName -like "*GA4*" -or $tName -like "*Analytics*" -or $tName -like "*MQ Hair*") {
            Write-Host "--------------------------------------------------------"
            Write-Host "TABELA: [$tName]"
            Write-Host $r["QUERYDEFINITION"]
        }
    }
} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
