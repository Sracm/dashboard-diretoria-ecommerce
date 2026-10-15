# -*- coding: utf-8 -*-
"""
Dados Oficiais Google Analytics 4 (GA4) / Power BI — E-commerce MQ Professional 2026
Métricas: Sessões (SOMASESSION), Pedidos (PEDIDOS), Taxa de Conversão (%)
Fonte Oficial: Power BI Diretoria E-commerce (DIR.CML ECOMMERCE.VS 7.1)
"""

DADOS_ANALYTICS_CONVERSAO_2026 = [
    {"mes": 1, "mes_abrev": "jan", "mes_nome": "Janeiro", "sessoes": 38558, "pedidos": 348, "taxa_conversao": 0.90, "status": "baixo"},
    {"mes": 2, "mes_abrev": "fev", "mes_nome": "Fevereiro", "sessoes": 26886, "pedidos": 400, "taxa_conversao": 1.49, "status": "alto"},
    {"mes": 3, "mes_abrev": "mar", "mes_nome": "Março", "sessoes": 31710, "pedidos": 486, "taxa_conversao": 1.53, "status": "alto"},
    {"mes": 4, "mes_abrev": "abr", "mes_nome": "Abril", "sessoes": 31381, "pedidos": 378, "taxa_conversao": 1.20, "status": "baixo"},
    {"mes": 5, "mes_abrev": "mai", "mes_nome": "Maio", "sessoes": 39482, "pedidos": 508, "taxa_conversao": 1.29, "status": "medio"},
    {"mes": 6, "mes_abrev": "jun", "mes_nome": "Junho", "sessoes": 34727, "pedidos": 517, "taxa_conversao": 1.49, "status": "alto"},
    {"mes": 7, "mes_abrev": "jul", "mes_nome": "Julho", "sessoes": 35087, "pedidos": 409, "taxa_conversao": 1.17, "status": "baixo"},
    {"mes": 8, "mes_abrev": "ago", "mes_nome": "Agosto", "sessoes": 35746, "pedidos": 558, "taxa_conversao": 1.56, "status": "alto"},
    {"mes": 9, "mes_abrev": "set", "mes_nome": "Setembro", "sessoes": 42837, "pedidos": 577, "taxa_conversao": 1.35, "status": "medio"},
    {"mes": 10, "mes_abrev": "out", "mes_nome": "Outubro", "sessoes": 37302, "pedidos": 493, "taxa_conversao": 1.32, "status": "medio"}
]

TOTAL_ANALYTICS_2026 = {
    "total_sessoes": 353716,
    "total_pedidos": 4674,
    "taxa_conversao_media": 1.32
}

def get_analytics_conversao():
    return {
        "meses": DADOS_ANALYTICS_CONVERSAO_2026,
        "totais": TOTAL_ANALYTICS_2026
    }
