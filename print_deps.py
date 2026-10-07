import json

with open('todas_medidas_dax.json', 'r', encoding='utf-8-sig') as f:
    todas = json.load(f)

deps = [
    '_SOMA VALOR VENDA', 'SOMA DAS DEVOLUCOES', 'TT ABSOLUTO FAT',
    'QTDE VENDAS MES ANTERIOR', 'Total de SOMA META para DIA', 'Total MAX DIA'
]

print('\n=== MEDIDAS DE SUPORTE / DEPENDENCIAS ===\n')
for item in todas:
    m = item.get('Medida', '')
    for d in deps:
        if m.strip().lower() == d.strip().lower():
            t = item.get('Tabela')
            expr = item.get('ExpressaoDAX', '').strip()
            print(f"TABELA: [{t}] | MEDIDA: [{m}]")
            print("DAX:")
            print(expr)
            print("-" * 60)
