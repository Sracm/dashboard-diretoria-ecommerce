# -*- coding: utf-8 -*-
"""
Dados Oficiais Google Analytics 4 (GA4) — E-commerce MQ Professional 2026
Métricas: Sessões (SOMASESSION), Pedidos (ecommercePurchases), Taxa de Conversão (%)
"""

DADOS_ANALYTICS_CONVERSAO_2026 = [
    {"mes": 1, "mes_abrev": "jan", "mes_nome": "Janeiro", "sessoes": 16303, "pedidos": 116, "taxa_conversao": 0.71, "status": "baixo"},
    {"mes": 2, "mes_abrev": "fev", "mes_nome": "Fevereiro", "sessoes": 10318, "pedidos": 153, "taxa_conversao": 1.48, "status": "alto"},
    {"mes": 3, "mes_abrev": "mar", "mes_nome": "Março", "sessoes": 11870, "pedidos": 179, "taxa_conversao": 1.51, "status": "alto"},
    {"mes": 4, "mes_abrev": "abr", "mes_nome": "Abril", "sessoes": 11905, "pedidos": 93, "taxa_conversao": 0.78, "status": "baixo"},
    {"mes": 5, "mes_abrev": "mai", "mes_nome": "Maio", "sessoes": 16484, "pedidos": 169, "taxa_conversao": 1.03, "status": "medio"},
    {"mes": 6, "mes_abrev": "jun", "mes_nome": "Junho", "sessoes": 13036, "pedidos": 252, "taxa_conversao": 1.93, "status": "alto"},
    {"mes": 7, "mes_abrev": "jul", "mes_nome": "Julho", "sessoes": 13623, "pedidos": 131, "taxa_conversao": 0.96, "status": "baixo"},
    {"mes": 8, "mes_abrev": "ago", "mes_nome": "Agosto", "sessoes": 14276, "pedidos": 223, "taxa_conversao": 1.56, "status": "alto"},
    {"mes": 9, "mes_abrev": "set", "mes_nome": "Setembro", "sessoes": 16003, "pedidos": 201, "taxa_conversao": 1.26, "status": "medio"},
    {"mes": 10, "mes_abrev": "out", "mes_nome": "Outubro", "sessoes": 13176, "pedidos": 142, "taxa_conversao": 1.08, "status": "medio"}
]

TOTAL_ANALYTICS_2026 = {
    "total_sessoes": 136994,
    "total_pedidos": 1659,
    "taxa_conversao_media": 1.21
}

def get_analytics_conversao():
    return {
        "meses": DADOS_ANALYTICS_CONVERSAO_2026,
        "totais": TOTAL_ANALYTICS_2026
    }
