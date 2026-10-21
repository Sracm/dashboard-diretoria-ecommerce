# -*- coding: utf-8 -*-
"""
Dados Oficiais Google Analytics 4 (GA4) / Power BI — E-commerce MQ Professional 2026
Métricas Oficiais Power BI:
  - SOMASESSION = SUM('MQ Hair — GA4'[sessions])
  - PEDIDOS = [DISTINCT NOTAS VTEX]
  - TXA CONVERSAO = [TXA CONVERSAO VTEX] = DIVIDE([PEDIDOS], [SOMASESSION])
Fonte Oficial: Power BI Diretoria E-commerce (DIR.CML ECOMMERCE.VS 7.1)
"""

import calendar
import datetime
from db import get_mariadb_connection, carregar_pedidos_vtex_mes

# Sessões históricas consolidadas GA4 por mês (2026)
SESSOES_GA4_2026 = {
    1: 43886,
    2: 31241,
    3: 36318,
    4: 36043,
    5: 45095,
    6: 40159,
    7: 40077,
    8: 40632,
    9: 49637,
    10: 40510,
    11: 0,
    12: 0
}

NOMES_MESES = [
    ("jan", "Janeiro"), ("fev", "Fevereiro"), ("mar", "Março"),
    ("abr", "Abril"),   ("mai", "Maio"),      ("jun", "Junho"),
    ("jul", "Julho"),   ("ago", "Agosto"),    ("set", "Setembro"),
    ("out", "Outubro"), ("nov", "Novembro"),  ("dez", "Dezembro")
]

# Baseline padrão para fallback caso banco esteja offline
DADOS_ANALYTICS_CONVERSAO_2026 = [
    {"mes": 1, "mes_abrev": "jan", "mes_nome": "Janeiro", "sessoes": 43886, "pedidos": 828, "taxa_conversao": 1.89, "status": "alta"},
    {"mes": 2, "mes_abrev": "fev", "mes_nome": "Fevereiro", "sessoes": 31241, "pedidos": 815, "taxa_conversao": 2.61, "status": "alta"},
    {"mes": 3, "mes_abrev": "mar", "mes_nome": "Março", "sessoes": 36318, "pedidos": 1089, "taxa_conversao": 3.00, "status": "alta"},
    {"mes": 4, "mes_abrev": "abr", "mes_nome": "Abril", "sessoes": 36043, "pedidos": 746, "taxa_conversao": 2.07, "status": "alta"},
    {"mes": 5, "mes_abrev": "mai", "mes_nome": "Maio", "sessoes": 45095, "pedidos": 1038, "taxa_conversao": 2.30, "status": "alta"},
    {"mes": 6, "mes_abrev": "jun", "mes_nome": "Junho", "sessoes": 40159, "pedidos": 934, "taxa_conversao": 2.33, "status": "alta"},
    {"mes": 7, "mes_abrev": "jul", "mes_nome": "Julho", "sessoes": 40077, "pedidos": 781, "taxa_conversao": 1.95, "status": "alta"},
    {"mes": 8, "mes_abrev": "ago", "mes_nome": "Agosto", "sessoes": 40632, "pedidos": 1301, "taxa_conversao": 3.20, "status": "alta"},
    {"mes": 9, "mes_abrev": "set", "mes_nome": "Setembro", "sessoes": 49637, "pedidos": 1286, "taxa_conversao": 2.59, "status": "alta"},
    {"mes": 10, "mes_abrev": "out", "mes_nome": "Outubro", "sessoes": 40510, "pedidos": 745, "taxa_conversao": 1.84, "status": "alta"}
]

TOTAL_ANALYTICS_2026 = {
    "total_sessoes": sum(m["sessoes"] for m in DADOS_ANALYTICS_CONVERSAO_2026),
    "total_pedidos": sum(m["pedidos"] for m in DADOS_ANALYTICS_CONVERSAO_2026),
    "taxa_conversao_media": round((sum(m["pedidos"] for m in DADOS_ANALYTICS_CONVERSAO_2026) / sum(m["sessoes"] for m in DADOS_ANALYTICS_CONVERSAO_2026) * 100), 2)
}

def obter_pedidos_vtex_meses(ano=2026, meses=None, dia_ini=1, dia_fim=None):
    """
    Busca pedidos únicos VTEX por mês no MariaDB (ecom_pedidos_vtex) com fallback para Oracle.
    """
    pedidos_por_mes = {}
    try:
        conn = get_mariadb_connection()
        try:
            with conn.cursor() as cur:
                if meses and len(meses) == 1 and dia_fim:
                    m = meses[0]
                    sql = """
                        SELECT mes, COUNT(DISTINCT pedido_vtex)
                        FROM ecom_pedidos_vtex
                        WHERE ano = %s AND mes = %s AND dia BETWEEN %s AND %s
                        GROUP BY mes
                    """
                    cur.execute(sql, (ano, m, dia_ini, dia_fim))
                    for row in cur.fetchall():
                        pedidos_por_mes[row[0]] = int(row[1])
                else:
                    sql = """
                        SELECT mes, COUNT(DISTINCT pedido_vtex)
                        FROM ecom_pedidos_vtex
                        WHERE ano = %s
                        GROUP BY mes
                    """
                    cur.execute(sql, (ano,))
                    for row in cur.fetchall():
                        pedidos_por_mes[row[0]] = int(row[1])
        finally:
            conn.close()
    except Exception as e:
        # Fallback usando db.py
        target_meses = meses if meses else list(range(1, 13))
        for m in target_meses:
            try:
                df = carregar_pedidos_vtex_mes(ano, m)
                if not df.empty:
                    if dia_fim:
                        df_f = df[(df["DIA"] >= dia_ini) & (df["DIA"] <= dia_fim)]
                        pedidos_por_mes[m] = int(df_f["PEDIDO_VTEX"].nunique())
                    else:
                        pedidos_por_mes[m] = int(df["PEDIDO_VTEX"].nunique())
            except Exception:
                pass

    return pedidos_por_mes

def get_analytics_conversao(meses=None, ano=2026, dia_ini=1, dia_fim=None):
    """
    Calcula dinamicamente a conversão do E-commerce (VTEX + GA4) integrando os pedidos em tempo real.
    """
    try:
        pedidos_reais = obter_pedidos_vtex_meses(ano=ano, meses=meses, dia_ini=dia_ini, dia_fim=dia_fim)
    except Exception:
        pedidos_reais = {}

    agora = datetime.datetime.now()
    mes_atual = agora.month if ano == agora.year else 12

    max_m = max(mes_atual, max(pedidos_reais.keys())) if pedidos_reais else 10
    lista_meses = []

    for m in range(1, max_m + 1):
        abrev, nome = NOMES_MESES[m - 1]
        sess = SESSOES_GA4_2026.get(m, 0)

        # Ajuste de sessões caso haja filtro de período ativo no mês atual
        if meses and m in meses and dia_fim and m == mes_atual:
            dias_tot = calendar.monthrange(ano, m)[1]
            if dia_fim < dias_tot and sess > 0:
                sess_periodo = int(round(sess * (min(dia_fim, dias_tot) / dias_tot)))
            else:
                sess_periodo = sess
        else:
            sess_periodo = sess

        # Pedidos reais do banco de dados (ou fallback do baseline)
        if m in pedidos_reais:
            ped = pedidos_reais[m]
        else:
            base_item = next((item for item in DADOS_ANALYTICS_CONVERSAO_2026 if item["mes"] == m), None)
            ped = base_item["pedidos"] if base_item else 0

        tx = round((ped / sess_periodo * 100), 2) if sess_periodo > 0 else 0.0
        status = "alta" if tx >= 1.4 else ("baixa" if tx < 1.0 else "medio")

        lista_meses.append({
            "mes": m,
            "mes_abrev": abrev,
            "mes_nome": nome,
            "sessoes": sess_periodo,
            "pedidos": ped,
            "taxa_conversao": tx,
            "status": status
        })

    # Filtrar meses solicitados
    if meses and len(meses) > 0 and len(meses) < 12:
        filtrados = [m for m in lista_meses if m["mes"] in meses]
    else:
        filtrados = lista_meses

    if filtrados:
        tot_sess = sum(m["sessoes"] for m in filtrados)
        tot_ped = sum(m["pedidos"] for m in filtrados)
        taxa_med = round((tot_ped / tot_sess * 100), 2) if tot_sess > 0 else 0.0
    else:
        tot_sess = 0
        tot_ped = 0
        taxa_med = 0.0

    return {
        "meses": lista_meses,
        "totais": {
            "total_sessoes": tot_sess,
            "total_pedidos": tot_ped,
            "taxa_conversao_media": taxa_med
        }
    }
