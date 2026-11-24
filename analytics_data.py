# -*- coding: utf-8 -*-
"""
Dados Oficiais Google Analytics 4 (GA4) / Sankhya VTEX no MariaDB – E-commerce MQ Professional 2026
Métricas Oficiais (idênticas ao Power BI DIR.CML ECOMMERCE.VS 7.1):
  - SESSÕES = SUM('MQ Hair – GA4'[sessions]) -> SUM(ecom_ga4_sessoes.sessoes)
  - PEDIDOS = DISTINCTCOUNT(Consulta1[NUNOTA]) com DESCROPER='7- VENDA NF-E ECOMERCE' (TOP 3219) e VENDEDOR='LOJA VTEX'
              -> COUNT(DISTINCT ecom_vendas_data.nunota)
  - TXA CONVERSÃO = IFERROR([DISTINCT NOTAS VTEX] / [SOMASESSION], 0)
Origem: 100% MariaDB (ecommerce_performance) sincronizado continuamente.
"""

import calendar
import datetime
from db import get_mariadb_connection

NOMES_MESES = [
    ("jan", "Janeiro"), ("fev", "Fevereiro"), ("mar", "Março"),
    ("abr", "Abril"),   ("mai", "Maio"),      ("jun", "Junho"),
    ("jul", "Julho"),   ("ago", "Agosto"),    ("set", "Setembro"),
    ("out", "Outubro"), ("nov", "Novembro"),  ("dez", "Dezembro")
]

def obter_metricas_ga4_mariadb(ano=2026, dia_ini=1, dia_fim=None, meses=None):
    """
    Busca métricas oficiais completas do GA4 diretamente da tabela ecom_ga4_sessoes no MariaDB:
    Sessões, Usuários Ativos, Adições ao Carrinho, Compras e Receita.
    Para meses passados fechados, busca o mês completo.
    Para o mês corrente (ou meses filtrados), respeita dia_ini e dia_fim se fornecido.
    """
    metricas_por_mes = {}
    agora = datetime.datetime.now()
    mes_atual = agora.month if ano == agora.year else 12

    try:
        conn = get_mariadb_connection()
        try:
            with conn.cursor() as cur:
                # 1. Busca meses passados fechados (mês completo)
                cur.execute("""
                    SELECT mes, 
                           COALESCE(SUM(sessoes), 0),
                           COALESCE(SUM(usuarios_ativos), 0),
                           COALESCE(SUM(add_to_cart), 0),
                           COALESCE(SUM(compras), 0),
                           COALESCE(SUM(receita), 0.0)
                    FROM ecom_ga4_sessoes
                    WHERE ano = %s AND mes < %s
                    GROUP BY mes
                """, (ano, mes_atual))
                for row in cur.fetchall():
                    metricas_por_mes[row[0]] = {
                        "sessoes": int(row[1]),
                        "usuarios": int(row[2]),
                        "add_to_cart": int(row[3]),
                        "compras": int(row[4]),
                        "receita": float(row[5])
                    }

                # 2. Busca o mês corrente (ou futuro) respeitando dia_ini e dia_fim (MTD)
                where_cur = ["ano = %s", "mes >= %s"]
                params_cur = [ano, mes_atual]
                if dia_fim:
                    where_cur.append("dia BETWEEN %s AND %s")
                    params_cur.extend([dia_ini, dia_fim])

                cur.execute(f"""
                    SELECT mes, 
                           COALESCE(SUM(sessoes), 0),
                           COALESCE(SUM(usuarios_ativos), 0),
                           COALESCE(SUM(add_to_cart), 0),
                           COALESCE(SUM(compras), 0),
                           COALESCE(SUM(receita), 0.0)
                    FROM ecom_ga4_sessoes
                    WHERE {' AND '.join(where_cur)}
                    GROUP BY mes
                """, tuple(params_cur))
                for row in cur.fetchall():
                    metricas_por_mes[row[0]] = {
                        "sessoes": int(row[1]),
                        "usuarios": int(row[2]),
                        "add_to_cart": int(row[3]),
                        "compras": int(row[4]),
                        "receita": float(row[5])
                    }
        finally:
            conn.close()
    except Exception as e:
        print(f"[GA4 MariaDB] Erro ao buscar métricas: {e}")

    return metricas_por_mes

# Alias para compatibilidade
def obter_sessoes_ga4_mariadb(ano=2026, dia_ini=1, dia_fim=None, meses=None):
    res = obter_metricas_ga4_mariadb(ano, dia_ini, dia_fim, meses)
    return {m: v["sessoes"] for m, v in res.items()}

def obter_pedidos_vtex_meses(ano=2026, dia_ini=1, dia_fim=None, meses=None):
    """
    Busca pedidos únicos faturados da LOJA VTEX (TOP 3219 = '7- VENDA NF-E ECOMERCE')
    diretamente da tabela ecom_vendas_data no MariaDB, idêntico à medida oficial do Power BI.
    Para meses passados fechados, busca o mês completo.
    Para o mês corrente, respeita dia_ini e dia_fim (MTD).
    """
    pedidos_por_mes = {}
    agora = datetime.datetime.now()
    mes_atual = agora.month if ano == agora.year else 12

    try:
        conn = get_mariadb_connection()
        try:
            with conn.cursor() as cur:
                # 1. Meses passados fechados (mês completo)
                cur.execute("""
                    SELECT mes, COUNT(DISTINCT nunota)
                    FROM ecom_vendas_data
                    WHERE ano = %s AND mes < %s AND vendedor = 'LOJA VTEX' AND codtipoper = 3219
                    GROUP BY mes
                """, (ano, mes_atual))
                for row in cur.fetchall():
                    pedidos_por_mes[row[0]] = int(row[1])

                # 2. Mês corrente respeitando dia_ini e dia_fim
                where_cur = [
                    "ano = %s",
                    "mes >= %s",
                    "vendedor = 'LOJA VTEX'",
                    "codtipoper = 3219"
                ]
                params_cur = [ano, mes_atual]
                if dia_fim:
                    where_cur.append("dia BETWEEN %s AND %s")
                    params_cur.extend([dia_ini, dia_fim])

                cur.execute(f"""
                    SELECT mes, COUNT(DISTINCT nunota)
                    FROM ecom_vendas_data
                    WHERE {' AND '.join(where_cur)}
                    GROUP BY mes
                """, tuple(params_cur))
                for row in cur.fetchall():
                    pedidos_por_mes[row[0]] = int(row[1])
        finally:
            conn.close()
    except Exception as e:
        print(f"[VTEX MariaDB] Erro ao buscar pedidos: {e}")

    return pedidos_por_mes

def get_analytics_conversao(meses=None, ano=2026, dia_ini=1, dia_fim=None):
    """
    Calcula dinamicamente a conversão do E-commerce (VTEX + GA4) buscando 100% dos dados do MariaDB.
    A tabela reflete a evolução histórica completa com métricas de Funil (Sessões, Usuários, Adições ao Carrinho, Pedidos, Taxa de Conversão).
    Os totais (mini-KPIs) adaptam-se dinamicamente ao(s) mês(es) selecionado(s) no filtro do dashboard.
    """
    metricas_db = obter_metricas_ga4_mariadb(ano=ano, dia_ini=dia_ini, dia_fim=dia_fim, meses=meses)
    pedidos_db = obter_pedidos_vtex_meses(ano=ano, dia_ini=dia_ini, dia_fim=dia_fim, meses=meses)

    agora = datetime.datetime.now()
    mes_atual = agora.month if ano == agora.year else 12

    max_m = max([mes_atual] + list(metricas_db.keys()) + list(pedidos_db.keys())) if (metricas_db or pedidos_db) else 11
    lista_meses = []

    for m in range(1, max_m + 1):
        abrev, nome = NOMES_MESES[m - 1]
        m_ga = metricas_db.get(m, {"sessoes": 0, "usuarios": 0, "add_to_cart": 0, "compras": 0, "receita": 0.0})
        sess = m_ga["sessoes"]
        users = m_ga["usuarios"]
        add_cart = m_ga["add_to_cart"]
        ped = pedidos_db.get(m, 0)

        tx = round((ped / sess * 100), 2) if sess > 0 else 0.0
        tx_cart = round((add_cart / sess * 100), 2) if sess > 0 else 0.0
        tx_abandono = round(((add_cart - ped) / add_cart * 100), 2) if add_cart > ped else 0.0
        status = "alta" if tx >= 1.4 else ("baixa" if tx < 1.0 else "medio")

        lista_meses.append({
            "mes": m,
            "mes_abrev": abrev,
            "mes_nome": nome,
            "sessoes": sess,
            "usuarios": users,
            "add_to_cart": add_cart,
            "pedidos": ped,
            "taxa_conversao": tx,
            "taxa_carrinho": tx_cart,
            "taxa_abandono": tx_abandono,
            "receita_ga4": m_ga["receita"],
            "compras_ga4": m_ga["compras"],
            "status": status
        })

    # Determina os meses alvo com base no filtro do dashboard
    if meses and isinstance(meses, (list, tuple)):
        meses_alvo = [m for m in meses if any(item["mes"] == m for item in lista_meses)]
    else:
        meses_alvo = [item["mes"] for item in lista_meses]

    if not meses_alvo:
        meses_alvo = [item["mes"] for item in lista_meses]

    itens_periodo = [m for m in lista_meses if m["mes"] in meses_alvo]
    tot_sess_periodo = sum(m["sessoes"] for m in itens_periodo)
    tot_users_periodo = sum(m["usuarios"] for m in itens_periodo)
    tot_cart_periodo = sum(m["add_to_cart"] for m in itens_periodo)
    tot_ped_periodo = sum(m["pedidos"] for m in itens_periodo)
    taxa_med_periodo = round((tot_ped_periodo / tot_sess_periodo * 100), 2) if tot_sess_periodo > 0 else 0.0
    taxa_cart_periodo = round((tot_cart_periodo / tot_sess_periodo * 100), 2) if tot_sess_periodo > 0 else 0.0
    taxa_abandono_periodo = round(((tot_cart_periodo - tot_ped_periodo) / tot_cart_periodo * 100), 2) if tot_cart_periodo > tot_ped_periodo else 0.0

    tot_sess_ano = sum(m["sessoes"] for m in lista_meses)
    tot_users_ano = sum(m["usuarios"] for m in lista_meses)
    tot_cart_ano = sum(m["add_to_cart"] for m in lista_meses)
    tot_ped_ano = sum(m["pedidos"] for m in lista_meses)
    taxa_med_ano = round((tot_ped_ano / tot_sess_ano * 100), 2) if tot_sess_ano > 0 else 0.0

    return {
        "meses": lista_meses,
        "totais": {
            "total_sessoes": tot_sess_periodo,
            "total_usuarios": tot_users_periodo,
            "total_add_to_cart": tot_cart_periodo,
            "total_pedidos": tot_ped_periodo,
            "taxa_conversao_media": taxa_med_periodo,
            "taxa_carrinho_media": taxa_cart_periodo,
            "taxa_abandono_media": taxa_abandono_periodo,
            "total_sessoes_ano": tot_sess_ano,
            "total_users_ano": tot_users_ano,
            "total_cart_ano": tot_cart_ano,
            "total_pedidos_ano": tot_ped_ano,
            "taxa_conversao_ano": taxa_med_ano,
            "meses_selecionados": meses_alvo
        }
    }
