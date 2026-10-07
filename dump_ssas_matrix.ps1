$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52456
$connStr = "Data Source=localhost:$port;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($connStr)

try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    
    # Query exact items in Consulta1 filtered as in tab 'teste'
    $cmd.CommandText = @"
    EVALUATE
    SUMMARIZECOLUMNS(
        'Tabela CANAL'[NOME CANAL],
        Consulta1[GRUPO_SINTETICO],
        Consulta1[PRODUTO],
        FILTER('DCALENDARIO', 'DCALENDARIO'[ANO] = 2026 && 'DCALENDARIO'[NOME MES] = "outubro" && 'DCALENDARIO'[DIA] <= 5),
        "QTDE", [SOMA QTDE DE VENDAS],
        "FAT", [_VENDA(-) FRETE (+) DEVOLUCAO]
    )
"@

    $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
    $ds = New-Object System.Data.DataSet
    $adapter.Fill($ds) | Out-Null
    
    Write-Host "Total rows returned: $($ds.Tables[0].Rows.Count)"
    $table = $ds.Tables[0]
    $json = @()
    foreach ($r in $table.Rows) {
        $json += [PSCustomObject]@{
            MacroCanal = $r[0]
            Grupo = $r[1]
            Produto = $r[2]
            Qtd = $r[3]
            Fat = $r[4]
        }
    }
    $json | ConvertTo-Json -Depth 4 | Out-File -FilePath "ssas_matrix_teste.json" -Encoding utf8
    Write-Host "Salvo em ssas_matrix_teste.json!"

} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
