$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52456
$connStr = "Data Source=localhost:$port;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($connStr)

try {
    $conn.Open()

    $dax = @"
    EVALUATE
    SUMMARIZECOLUMNS(
        'Consulta1'[NOME_CANAL],
        'Consulta1'[GRUPO_PROD],
        'Consulta1'[PRODUTO],
        FILTER('Consulta1', 'Consulta1'[ANO] = 2026 && 'Consulta1'[MES] = 10 && 'Consulta1'[DIA] <= 5),
        "QTD", [SOMA QTDE DE VENDAS],
        "FAT", [_VENDA(-) FRETE (+) DEVOLUCAO],
        "VLR_MEDIO", [VALOR MEDIO],
        "EVOL_MES", [EVOLUCAO MES %]
    )
"@

    # Let's test checking what columns exist in Consulta1
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT [DIMENSION_UNIQUE_NAME], [HIERARCHY_NAME] FROM `$SYSTEM.MDSCHEMA_HIERARCHIES WHERE [CUBE_NAME] = 'Model'"
    $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
    $ds = New-Object System.Data.DataSet
    $adapter.Fill($ds) | Out-Null
    
    foreach ($r in $ds.Tables[0].Rows) {
        Write-Host "$($r['DIMENSION_UNIQUE_NAME']).$($r['HIERARCHY_NAME'])"
    }

} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
