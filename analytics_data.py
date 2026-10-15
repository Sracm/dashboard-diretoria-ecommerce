# -*- coding: utf-8 -*-
"""
Dados Oficiais Google Analytics 4 (GA4) / Power BI — E-commerce MQ Professional 2026
Métricas Oficiais Power BI:
  - SOMASESSION = SUM('MQ Hair – GA4'[sessions])
  - PEDIDOS = [DISTINCT NOTAS VTEX]
  - TXA CONVERSAO = [TXA CONVERSAO VTEX] = DIVIDE([PEDIDOS], [SOMASESSION])
Fonte Oficial: Power BI Diretoria E-commerce (DIR.CML ECOMMERCE.VS 7.1)
"""

DADOS_ANALYTICS_CONVERSAO_2026 = [
    {"mes": 1, "mes_abrev": "jan", "mes_nome": "Janeiro", "sessoes": 43886, "pedidos": 409, "taxa_conversao": 0.93, "status": "baixo"},
    {"mes": 2, "mes_abrev": "fev", "mes_nome": "Fevereiro", "sessoes": 31241, "pedidos": 400, "taxa_conversao": 1.28, "status": "medio"},
    {"mes": 3, "mes_abrev": "mar", "mes_nome": "Março", "sessoes": 36318, "pedidos": 486, "taxa_conversao": 1.34, "status": "medio"},
    {"mes": 4, "mes_abrev": "abr", "mes_nome": "Abril", "sessoes": 36043, "pedidos": 418, "taxa_conversao": 1.16, "status": "baixo"},
    {"mes": 5, "mes_abrev": "mai", "mes_nome": "Maio", "sessoes": 45095, "pedidos": 577, "taxa_conversao": 1.28, "status": "medio"},
    {"mes": 6, "mes_abrev": "jun", "mes_nome": "Junho", "sessoes": 40159, "pedidos": 575, "taxa_conversao": 1.43, "status": "alto"},
    {"mes": 7, "mes_abrev": "jul", "mes_nome": "Julho", "sessoes": 40077, "pedidos": 474, "taxa_conversao": 1.18, "status": "baixo"},
    {"mes": 8, "mes_abrev": "ago", "mes_nome": "Agosto", "sessoes": 40632, "pedidos": 622, "taxa_conversao": 1.53, "status": "alto"},
    {"mes": 9, "mes_abrev": "set", "mes_nome": "Setembro", "sessoes": 49637, "pedidos": 686, "taxa_conversao": 1.38, "status": "medio"},
    {"mes": 10, "mes_abrev": "out", "mes_nome": "Outubro", "sessoes": 40510, "pedidos": 526, "taxa_conversao": 1.30, "status": "medio"}
]

TOTAL_ANALYTICS_2026 = {
    "total_sessoes": 403598,
    "total_pedidos": 5173,
    "taxa_conversao_media": 1.28
}

def get_analytics_conversao(meses=None):
    if meses and len(meses) > 0 and len(meses) < 12:
        filtrados = [m for m in DADOS_ANALYTICS_CONVERSAO_2026 if m["mes"] in meses]
        if filtrados:
            tot_sess = sum(m["sessoes"] for m in filtrados)
            tot_ped = sum(m["pedidos"] for m in filtrados)
            taxa_med = round((tot_ped / tot_sess * 100), 2) if tot_sess > 0 else 0.0
            return {
                "meses": DADOS_ANALYTICS_CONVERSAO_2026,
                "totais": {
                    "total_sessoes": tot_sess,
                    "total_pedidos": tot_ped,
                    "taxa_conversao_media": taxa_med
                }
            }
    return {
        "meses": DADOS_ANALYTICS_CONVERSAO_2026,
        "totais": TOTAL_ANALYTICS_2026
    }
