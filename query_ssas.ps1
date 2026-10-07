$dllPath = "C:\Program Files\On-premises data gateway\Microsoft.AnalysisServices.AdomdClient.dll"
Add-Type -Path $dllPath -ErrorAction SilentlyContinue

$port = 52692
$connStr = "Data Source=localhost:$port;"
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($connStr)

try {
    $conn.Open()
    Write-Host "Conectado com sucesso via AdomdClient na porta $port!"
    
    # 1. Obter Medidas via MDSCHEMA_MEASURES
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT [CATALOG_NAME], [MEASURE_NAME], [MEASUREGROUP_NAME], [EXPRESSION], [DESCRIPTION] FROM `$SYSTEM.MDSCHEMA_MEASURES"
    $adapter = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdDataAdapter($cmd)
    $dsMeasures = New-Object System.Data.DataSet
    $adapter.Fill($dsMeasures) | Out-Null
    
    $result = @()
    foreach ($r in $dsMeasures.Tables[0].Rows) {
        $mName = $r["MEASURE_NAME"]
        $expr = $r["EXPRESSION"]
        $tName = $r["MEASUREGROUP_NAME"]
        
        # Ignora medidas internas que não têm expressão
        if (-not [string]::IsNullOrWhiteSpace($expr)) {
            $result += [PSCustomObject]@{
                Tabela = $tName
                Medida = $mName
                ExpressaoDAX = $expr
            }
        }
    }
    
    $result | ConvertTo-Json -Depth 4 | Out-File -FilePath "todas_medidas_dax.json" -Encoding utf8
    Write-Host "Total de medidas com DAX extraídas: $($result.Count)"
    
    # Exibir resumo das medidas
    foreach ($item in $result) {
        Write-Host "[$($item.Tabela)].[$($item.Medida)]"
    }
} catch {
    Write-Error $_
} finally {
    $conn.Close()
}
