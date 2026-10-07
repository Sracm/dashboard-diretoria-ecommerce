import oracledb

user = 'POWERBI'
password = '@Yzmpq100#'
dsn = '192.168.1.55/ORCL'

conn = oracledb.connect(user=user, password=password, dsn=dsn)
cur = conn.cursor()
cur.execute('ALTER SESSION SET CURRENT_SCHEMA = SANKHYA')

sql = '''
SELECT 
    EXTRACT(DAY FROM CAB.DTENTSAI) as DIA,
    VEN.APELIDO,
    PRO.MARCA,
    ROUND(SUM(((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',0,'V',1)
        - NVL(F_OBTEM_FRETEITE(CAB.NUNOTA,ITE.SEQUENCIA), 0)
        - ((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',1,'V',0)
    ), 2) AS FAT_LIQ
FROM TGFCAB CAB
     JOIN TGFITE ITE ON CAB.NUNOTA = ITE.NUNOTA
     JOIN TGFTOP TOP ON CAB.CODTIPOPER = TOP.CODTIPOPER AND CAB.DHTIPOPER = TOP.DHALTER
     JOIN TGFPAR PAR ON CAB.CODPARC = PAR.CODPARC
     JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD
     JOIN VGFCAB VCA ON CAB.NUNOTA = VCA.NUNOTA
     LEFT JOIN TGFVEN VEN ON CAB.CODVEND = VEN.CODVEND
WHERE CAB.TIPMOV IN ('V', 'D')
  AND CAB.STATUSNOTA = 'L' 
  AND (TOP.GOLSINAL = -1 OR TOP.BONIFICACAO='S')
  AND (NOT EXISTS(SELECT 1 FROM TGFVAR VAR WHERE VAR.NUNOTA = ITE.NUNOTA AND VAR.NUNOTAORIG = VAR.NUNOTA AND VAR.SEQUENCIAORIG = ITE.SEQUENCIA))
  AND (TOP.ATUALFINTERC <> 'N' OR TOP.ATUALESTTERC = 'N' OR  ITE.TERCEIROS <> 'S')
  AND ITE.SEQUENCIA > 0    
  AND TOP.GOLDEV IN (1,-1)
  AND (VEN.CODGER = 7193 OR VEN.CODVEND = 7193)
  AND CAB.DTENTSAI >= TO_DATE('01/10/2026','DD/MM/YYYY')
  AND CAB.DTENTSAI <= TO_DATE('05/10/2026','DD/MM/YYYY')
GROUP BY EXTRACT(DAY FROM CAB.DTENTSAI), VEN.APELIDO, PRO.MARCA
ORDER BY DIA
'''

cur.execute(sql)
rows = cur.fetchall()

def get_canal(apelido, marca):
    apelido = str(apelido or '').upper()
    marca = str(marca or '').upper()
    if 'PARLUX' in marca:
        return 'PARLUX'
    if 'MERC' in apelido:
        return 'MERCADO LIVRE'
    if 'VTEX' in apelido or 'PROPRIA' in apelido:
        return 'VTEX'
    if 'SHOPEE' in apelido:
        return 'SHOPEE'
    if 'MAGALU' in apelido:
        return 'MAGALU'
    return 'OUTROS'

dias = [1, 2, 3, 4, 5]
canais = ['MERCADO LIVRE', 'VTEX', 'SHOPEE', 'MAGALU', 'PARLUX']

dados_dia = {d: {c: 0.0 for c in canais} for d in dias}
for d, ap, m, val in rows:
    c = get_canal(ap, m)
    if c in canais and d in dados_dia:
        dados_dia[d][c] += (val or 0.0)

print('=== VALORES ACUMULADOS DIA A DIA (COMPARAÇÃO POWER BI) ===')
acum = {c: 0.0 for c in canais}
acum_geral = 0.0
for d in dias:
    dia_total = 0.0
    for c in canais:
        acum[c] += dados_dia[d][c]
        dia_total += dados_dia[d][c]
    acum_geral += dia_total
    ml = round(acum['MERCADO LIVRE'])
    vx = round(acum['VTEX'])
    sh = round(acum['SHOPEE'])
    mg = round(acum['MAGALU'])
    px = round(acum['PARLUX'])
    ger = round(acum_geral)
    print(f"Dia {d}: ML: R$ {ml:,} | VTEX: R$ {vx:,} | SHOPEE: R$ {sh:,} | MAGALU: R$ {mg:,} | PARLUX: R$ {px:,} || GERAL: R$ {ger:,}")

cur.close()
conn.close()
