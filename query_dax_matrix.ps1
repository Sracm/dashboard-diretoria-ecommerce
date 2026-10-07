$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52456
$connStr = "Data Source=localhost:$port;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($connStr)

try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    
    # Run exact DAX query matching the matrix
    $cmd.CommandText = @"
    EVALUATE
    SUMMARIZECOLUMNS(
        'Tabela CANAL'[NOME CANAL],
        Consulta1[GRUPO SINTETICO],
        Consulta1[PRODUTO],
        FILTER('DCALENDARIO', 'DCALENDARIO'[ANO] = 2026 && 'DCALENDARIO'[NMERO DO MS] = 10 && 'DCALENDARIO'[DIA] <= 5),
        "QTDE_VENDAS", [SOMA QTDE DE VENDAS],
        "VLR_FAT", [_VENDA(-) FRETE (+) DEVOLUCAO],
        "PCT", [% DO FAT],
        "VLR_MEDIO", [VALOR MEDIO],
        "EVOLUCAO_MES", [EVOLUCAO MES %]
    )
"@

    $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
    $ds = New-Object System.Data.DataSet
    $adapter.Fill($ds) | Out-Null
    
    Write-Host "Total rows returned: $($ds.Tables[0].Rows.Count)"
    foreach ($r in $ds.Tables[0].Rows) {
        $c = $r[0]
        $grp = $r[1]
        $prod = $r[2]
        $qtd = $r[3]
        $fat = $r[4]
        $pct = $r[5]
        $vm = $r[6]
        $evol = $r[7]
        Write-Host "$c | $grp | $prod | Qtd: $qtd | Fat: $fat | Pct: $pct | VM: $vm | Evol: $evol"
    }

} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
