$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52456
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
    
    foreach ($r in $dsP.Tables[0].Rows) {
        $tName = $tableMap[$r["TABLE_ID"]]
        if ($tName -eq "Consulta1") {
            Write-Host "TABELA: [$tName]"
            $r["QUERYDEFINITION"] | Out-File -FilePath "consulta1_m_query.txt" -Encoding utf8
            Write-Host "Salvo em consulta1_m_query.txt"
        }
    }
} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
