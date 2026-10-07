import json

with open('todas_medidas_dax.json', 'r', encoding='utf-8-sig') as f:
    todas = json.load(f)

medidas_guia_teste = [
    '%devolucao', '(%) DO FAT.', 'CONTAGEM', 'DISTINCT NOTAS VTEX',
    'EVOLUCAO MES %', 'SOMA QTDE DE VENDAS', 'TOTAL VALUE', 'TT PREICE VALUE',
    'TXA CONVERSAO VTEX', '_SOMA DEVOLUCAO', '_SOMA FRETE',
    '_VENDA(-) FRETE (+) DEVOLUCAO', 'ticket', 'ACUMULADO FAT DIA MES', 'ACUMULADO META DIA MES',
    'SOMA META', 'MEDIA META DIA', 'SOMASESSION'
]

print('=== FÓRMULAS DAX EXATAS USADAS NA GUIA TESTE ===\n')
encontradas = {}
for item in todas:
    m_nome = item['Medida']
    for target in medidas_guia_teste:
        if m_nome.strip().lower() == target.strip().lower():
            encontradas[m_nome] = item

for nome, item in sorted(encontradas.items()):
    t = item.get("Tabela")
    m = item.get("Medida")
    expr = item.get("ExpressaoDAX", "").strip()
    print(f"TABELA: [{t}] | MEDIDA: [{m}]")
    print(f"DAX:")
    print(expr)
    print("-" * 65)

print(f"\nTotal encontradas: {len(encontradas)} de {len(medidas_guia_teste)}")
