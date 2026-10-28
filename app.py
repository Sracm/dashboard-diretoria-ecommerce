# -*- coding: utf-8 -*-
"""
Servidor Flask - Dashboard Executivo Diretoria de E-commerce
MQ Professional — Alinhado 100% às regras e métricas do Power BI
"""

import os
import time
import calendar
from datetime import datetime
import pandas as pd
from flask import Flask, render_template, jsonify, request
from config import Config
from metas_ecommerce_2026 import (
    METAS_ECOMMERCE_2026_V2,
    get_meta,
    get_meta_valor,
    get_meta_diaria,
    get_total_meta_mes,
    get_metas_mes,
    get_resumo_anual
)
from db import carregar_vendas_ecommerce, carregar_formas_pagamento_vtex, carregar_cupons_vtex, obter_ultima_atualizacao
from analytics_data import get_analytics_conversao

app = Flask(__name__)
app.config.from_object(Config)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_no_cache_headers(response):
    if request.path == '/' or request.path.endswith('.js') or request.path.endswith('.css'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


CANAIS_OFICIAIS = ["MERCADO LIVRE", "VTEX", "SHOPEE", "MAGALU", "PARLUX"]
NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]


def simplificar_nome_produto(nome):
    if not nome or pd.isna(nome):
        return "—"
    n = str(nome).strip()
    u = n.upper()
    if "PRO 480" in u or "PRO480" in u:
        if "VELOX" in u:
            return "PRO 480 VELOX"
        elif "TURBO" in u:
            return "PRO 480 TURBO"
        elif "SLIM" in u:
            return "PRO 480 SLIM"
        else:
            return "PRO 480"
    if "MAX480" in u or "MAX 480" in u:
        return "MAX 480"
    res = n
    for prefix in [
        "PRANCHA MQ ", "SECADOR MQ ", "MAQUINA MQ ", "ESCOVA MQ ",
        "MODELADOR MQ ", "PRANCHA ", "SECADOR ", "MAQUINA "
    ]:
        if res.upper().startswith(prefix):
            res = res[len(prefix):]
            break
    if len(res) > 28:
        res = res[:25] + "..."
    return res


@app.route("/")
def index():
    now = datetime.now()
    mes_padrao = now.month
    ano_padrao = now.year
    _, total_dias = calendar.monthrange(ano_padrao, mes_padrao)
    dia_padrao = min(now.day, total_dias)
    return render_template(
        "index.html",
        mes_atual=mes_padrao,
        ano_atual=ano_padrao,
        dia_hoje=dia_padrao,
        total_dias_mes=total_dias,
        canais=CANAIS_OFICIAIS
    )


# Cache em memória para resposta ultra-rápida de /api/resumo
_RESUMO_CACHE = {}
_RESUMO_CACHE_TTL = 300  # 5 minutos

@app.route("/api/resumo")
def api_resumo():
    try:
        now = datetime.now()
        force = request.args.get("force", "false").lower() in ("true", "1")
        
        # Suporte a múltiplos anos e meses
        anos_param = request.args.get("anos") or request.args.get("ano")
        if anos_param:
            anos = [int(a.strip()) for a in str(anos_param).split(",") if a.strip().isdigit()]
        else:
            anos = [now.year]
        if not anos:
            anos = [now.year]

        meses_param = request.args.get("meses") or request.args.get("mes")
        if meses_param:
            meses = [int(m.strip()) for m in str(meses_param).split(",") if m.strip().isdigit()]
        else:
            meses = [now.month]
        if not meses:
            meses = [now.month]

        ano = anos[0]
        mes = meses[0]

        # Filtros opcionais
        canal_filtro = request.args.get("canal", "Todos").strip()
        marca_filtro = request.args.get("marca", "Todas").strip()
        
        # Intervalo de dias: sempre do dia 1 até o dia atual (ou selecionado)
        max_dias_meses = max(calendar.monthrange(a, m)[1] for a in anos for m in meses)
        dia_ini = int(request.args.get("dia_ini", 1))
        if "dia_fim" in request.args:
            dia_fim = int(request.args.get("dia_fim"))
        else:
            if (now.year in anos) and (now.month in meses):
                dia_fim = now.day
            else:
                dia_fim = max_dias_meses
        dia_fim = min(max_dias_meses, max(dia_ini, dia_fim))

        # FAST PATH: Cache em memória se filtros repetidos (0ms)
        cache_key = (tuple(sorted(anos)), tuple(sorted(meses)), dia_ini, dia_fim, str(marca_filtro), str(canal_filtro))
        if not force and cache_key in _RESUMO_CACHE:
            c_data, c_ts = _RESUMO_CACHE[cache_key]
            if time.time() - c_ts < _RESUMO_CACHE_TTL:
                return jsonify(c_data)
        if force:
            _RESUMO_CACHE.clear()

        # 1. Carrega dados de todos os anos e meses do Sankhya (com cache)
        dfs_meses = []
        for a in anos:
            for m in meses:
                df_am = carregar_vendas_ecommerce(ano=a, mes=m, force_refresh=force)
                if not df_am.empty:
                    dfs_meses.append(df_am)

        if dfs_meses:
            df_concat = pd.concat(dfs_meses, ignore_index=True)
            df = df_concat[df_concat["CANAL"].isin(CANAIS_OFICIAIS)].copy()
            if not df.empty:
                if "GRUPO_SINTETICO" not in df.columns:
                    df["GRUPO_SINTETICO"] = df["GRUPO"] if "GRUPO" in df.columns else "OUTROS"
                if "SKU_MQ" not in df.columns:
                    df["SKU_MQ"] = ""
        else:
            df = pd.DataFrame()
            
        # Aplica filtro de marca se selecionada
        if marca_filtro and marca_filtro != "Todas" and not df.empty:
            df = df[df["MARCA"] == marca_filtro.upper()].copy()
            
        # Aplica filtro de canal se selecionado
        if canal_filtro and canal_filtro != "Todos" and not df.empty:
            df = df[df["CANAL"] == canal_filtro.upper()].copy()

        # Filtragem pelo intervalo de dias selecionado (ex: dias 1 a dia_fim)
        if not df.empty:
            df_periodo = df[(df["DIA"] >= dia_ini) & (df["DIA"] <= dia_fim)].copy()
        else:
            df_periodo = df.copy()

        # df_kpis para KPIs consolidados gerais: se visão geral (Todos os canais e Todas as marcas),
        # exclui PARLUX conforme diretriz da Diretoria de E-commerce (Parlux tem meta e acompanhamento à parte)
        if (not canal_filtro or canal_filtro == "Todos") and (not marca_filtro or marca_filtro == "Todas"):
            df_kpis = df_periodo[df_periodo["CANAL"] != "PARLUX"].copy() if not df_periodo.empty else pd.DataFrame()
        else:
            df_kpis = df_periodo.copy()

        # 2. Cálculos Totais do Período (Regra DAX Exata: Faturamento Líquido = Venda - Frete - Devolução)
        venda_bruta_total = float(df_kpis["VALORVENDA"].sum()) if not df_kpis.empty else 0.0
        frete_total = float(df_kpis["FRETE"].sum()) if not df_kpis.empty else 0.0
        devolucao_total = float(df_kpis["VALORDEVOLUCAO"].sum()) if not df_kpis.empty else 0.0
        fat_liquido_total = venda_bruta_total - frete_total - devolucao_total
        
        qtd_itens_total = int(df_kpis["QTDVENDIDA"].sum()) if not df_kpis.empty else 0
        qtd_pedidos_total = int(df_kpis["NUNOTA"].nunique()) if not df_kpis.empty else 0
        ticket_medio = round(fat_liquido_total / qtd_itens_total, 2) if qtd_itens_total > 0 else 0.0
        pct_devolucao = round((devolucao_total / venda_bruta_total * 100), 2) if venda_bruta_total > 0 else 0.0

        # Metas para o conjunto de meses e anos selecionados
        total_dias_mes = 0
        dias_no_periodo = 0
        meta_mes_geral = 0.0
        for a in anos:
            for m in meses:
                _, d_mes = calendar.monthrange(a, m)
                total_dias_mes += d_mes
                dias_no_periodo += min(dia_fim, d_mes) - dia_ini + 1
                if a == 2026:
                    if canal_filtro and canal_filtro != "Todos":
                        meta_mes_geral += get_meta_valor(canal_filtro, m, versao=1)
                    else:
                        meta_mes_geral += get_total_meta_mes(m, versao=1, incluir_parlux=False)

        meta_dia_geral = meta_mes_geral / total_dias_mes if total_dias_mes > 0 else 0.0
        meta_periodo_geral = round(meta_dia_geral * dias_no_periodo, 2)
        
        atingimento_periodo_pct = round((fat_liquido_total / meta_periodo_geral * 100), 1) if meta_periodo_geral > 0 else 0.0
        atingimento_mes_pct = round((fat_liquido_total / meta_mes_geral * 100), 1) if meta_mes_geral > 0 else 0.0
        
        # Projeção do Mês (run-rate com base no ritmo dos dias analisados)
        media_diaria = fat_liquido_total / dias_no_periodo if dias_no_periodo > 0 else 0.0
        projecao_mes = round(media_diaria * total_dias_mes, 2)
        projecao_pct = round((projecao_mes / meta_mes_geral * 100), 1) if meta_mes_geral > 0 else 0.0
        gap_total = round(fat_liquido_total - meta_periodo_geral, 2)

        # Carrega dados do mês anterior para comparativo (linha azul nos gráficos)
        dfs_ant = []
        for a in anos:
            for m in meses:
                m_ant = 12 if m == 1 else m - 1
                a_ant = a - 1 if m == 1 else a
                df_mes_ant = carregar_vendas_ecommerce(ano=a_ant, mes=m_ant, force_refresh=force)
                if not df_mes_ant.empty:
                    dfs_ant.append(df_mes_ant)
        if dfs_ant:
            df_ant_concat = pd.concat(dfs_ant, ignore_index=True)
            df_ant = df_ant_concat[df_ant_concat["CANAL"].isin(CANAIS_OFICIAIS)].copy()
            if not df_ant.empty:
                if "GRUPO_SINTETICO" not in df_ant.columns:
                    df_ant["GRUPO_SINTETICO"] = df_ant["GRUPO"] if "GRUPO" in df_ant.columns else "OUTROS"
                if "SKU_MQ" not in df_ant.columns:
                    df_ant["SKU_MQ"] = "" 
            if marca_filtro and marca_filtro != "Todas":
                df_ant = df_ant[df_ant["MARCA"] == marca_filtro.upper()].copy()
            if canal_filtro and canal_filtro != "Todos":
                df_ant = df_ant[df_ant["CANAL"] == canal_filtro.upper()].copy()
        else:
            df_ant = pd.DataFrame()

        # Cálculos de Comparativos MoM Homólogo (mesmo intervalo de dias no mês anterior: dia_ini até dia_fim)
        if not df_ant.empty:
            df_ant_periodo = df_ant[(df_ant["DIA"] >= dia_ini) & (df_ant["DIA"] <= dia_fim)].copy()
        else:
            df_ant_periodo = pd.DataFrame()
            
        if (not canal_filtro or canal_filtro == "Todos") and (not marca_filtro or marca_filtro == "Todas"):
            df_ant_kpis = df_ant_periodo[df_ant_periodo["CANAL"] != "PARLUX"].copy() if not df_ant_periodo.empty else pd.DataFrame()
            df_ant_cheio_kpis = df_ant[df_ant["CANAL"] != "PARLUX"].copy() if not df_ant.empty else pd.DataFrame()
        else:
            df_ant_kpis = df_ant_periodo.copy()
            df_ant_cheio_kpis = df_ant.copy()

        vb_ant_periodo = float(df_ant_kpis["VALORVENDA"].sum()) if not df_ant_kpis.empty else 0.0
        fr_ant_periodo = float(df_ant_kpis["FRETE"].sum()) if not df_ant_kpis.empty else 0.0
        dv_ant_periodo = float(df_ant_kpis["VALORDEVOLUCAO"].sum()) if not df_ant_kpis.empty else 0.0
        fat_ant_periodo = vb_ant_periodo - fr_ant_periodo - dv_ant_periodo
        itens_ant_periodo = int(df_ant_kpis["QTDVENDIDA"].sum()) if not df_ant_kpis.empty else 0
        dev_pct_ant_periodo = round((dv_ant_periodo / vb_ant_periodo * 100), 2) if vb_ant_periodo > 0 else 0.0
        ticket_medio_ant_periodo = round(fat_ant_periodo / itens_ant_periodo, 2) if itens_ant_periodo > 0 else 0.0

        # Se o canal teve vendas no mês anterior fechado mas o período homologo ficou zerado (ex: Magalu no período 1..dia_fim):
        if fat_ant_periodo == 0.0 and not df_ant_cheio_kpis.empty:
            vb_ant_cheio_k = float(df_ant_cheio_kpis["VALORVENDA"].sum())
            fr_ant_cheio_k = float(df_ant_cheio_kpis["FRETE"].sum())
            dv_ant_cheio_k = float(df_ant_cheio_kpis["VALORDEVOLUCAO"].sum())
            fat_cheio_k = vb_ant_cheio_k - fr_ant_cheio_k - dv_ant_cheio_k
            if fat_cheio_k > 0:
                vb_ant_periodo = vb_ant_cheio_k
                fr_ant_periodo = fr_ant_cheio_k
                dv_ant_periodo = dv_ant_cheio_k
                fat_ant_periodo = fat_cheio_k
                itens_ant_periodo = int(df_ant_cheio_kpis["QTDVENDIDA"].sum())
                dev_pct_ant_periodo = round((dv_ant_periodo / vb_ant_periodo * 100), 2) if vb_ant_periodo > 0 else 0.0
                ticket_medio_ant_periodo = round(fat_ant_periodo / itens_ant_periodo, 2) if itens_ant_periodo > 0 else 0.0

        diff_fat_mom_pct = round((fat_liquido_total - fat_ant_periodo) / fat_ant_periodo * 100, 1) if fat_ant_periodo > 0 else 0.0
        diff_itens_mom_pct = round((qtd_itens_total - itens_ant_periodo) / itens_ant_periodo * 100, 1) if itens_ant_periodo > 0 else 0.0
        diff_dev_mom_pp = round(pct_devolucao - dev_pct_ant_periodo, 2)

        # Mês anterior total fechado para comparativo de Projeção
        vb_ant_cheio = float(df_ant_cheio_kpis["VALORVENDA"].sum()) if not df_ant_cheio_kpis.empty else 0.0
        fr_ant_cheio = float(df_ant_cheio_kpis["FRETE"].sum()) if not df_ant_cheio_kpis.empty else 0.0
        dv_ant_cheio = float(df_ant_cheio_kpis["VALORDEVOLUCAO"].sum()) if not df_ant_cheio_kpis.empty else 0.0
        fat_ant_mes_cheio = vb_ant_cheio - fr_ant_cheio - dv_ant_cheio
        diff_proj_mom_pct = round((projecao_mes - fat_ant_mes_cheio) / fat_ant_mes_cheio * 100, 1) if fat_ant_mes_cheio > 0 else 0.0

        # Cálculos de Comparativos YTD (Acumulado do Ano até o dia atual selecionado)
        df_ano_total = carregar_vendas_ecommerce(ano=ano, mes=None, force_refresh=force)
        df_ano_ant_total = carregar_vendas_ecommerce(ano=ano - 1, mes=None, force_refresh=False)

        df_ano_filt = df_ano_total[df_ano_total["CANAL"].isin(CANAIS_OFICIAIS)].copy() if not df_ano_total.empty else pd.DataFrame()
        if marca_filtro and marca_filtro != "Todas" and not df_ano_filt.empty:
            df_ano_filt = df_ano_filt[df_ano_filt["MARCA"] == marca_filtro.upper()]
        if canal_filtro and canal_filtro != "Todos" and not df_ano_filt.empty:
            df_ano_filt = df_ano_filt[df_ano_filt["CANAL"] == canal_filtro.upper()]
        elif (not canal_filtro or canal_filtro == "Todos") and (not marca_filtro or marca_filtro == "Todas") and not df_ano_filt.empty:
            df_ano_filt = df_ano_filt[df_ano_filt["CANAL"] != "PARLUX"]

        df_ano_ant_filt = df_ano_ant_total[df_ano_ant_total["CANAL"].isin(CANAIS_OFICIAIS)].copy() if not df_ano_ant_total.empty else pd.DataFrame()
        if marca_filtro and marca_filtro != "Todas" and not df_ano_ant_filt.empty:
            df_ano_ant_filt = df_ano_ant_filt[df_ano_ant_filt["MARCA"] == marca_filtro.upper()]
        if canal_filtro and canal_filtro != "Todos" and not df_ano_ant_filt.empty:
            df_ano_ant_filt = df_ano_ant_filt[df_ano_ant_filt["CANAL"] == canal_filtro.upper()]
        elif (not canal_filtro or canal_filtro == "Todos") and (not marca_filtro or marca_filtro == "Todas") and not df_ano_ant_filt.empty:
            df_ano_ant_filt = df_ano_ant_filt[df_ano_ant_filt["CANAL"] != "PARLUX"]

        mes_corte = max(meses)
        dia_corte = dia_fim

        df_ytd_atual = df_ano_filt[((df_ano_filt["MES"] < mes_corte) | ((df_ano_filt["MES"] == mes_corte) & (df_ano_filt["DIA"] <= dia_corte)))] if not df_ano_filt.empty else pd.DataFrame()
        df_ytd_ant = df_ano_ant_filt[((df_ano_ant_filt["MES"] < mes_corte) | ((df_ano_ant_filt["MES"] == mes_corte) & (df_ano_ant_filt["DIA"] <= dia_corte)))] if not df_ano_ant_filt.empty else pd.DataFrame()

        vb_ytd = float(df_ytd_atual["VALORVENDA"].sum()) if not df_ytd_atual.empty else 0.0
        fr_ytd = float(df_ytd_atual["FRETE"].sum()) if not df_ytd_atual.empty else 0.0
        dv_ytd = float(df_ytd_atual["VALORDEVOLUCAO"].sum()) if not df_ytd_atual.empty else 0.0
        fat_ytd = vb_ytd - fr_ytd - dv_ytd
        itens_ytd = int(df_ytd_atual["QTDVENDIDA"].sum()) if not df_ytd_atual.empty else 0
        dev_pct_ytd = round((dv_ytd / vb_ytd * 100), 2) if vb_ytd > 0 else 0.0

        vb_ytd_ant = float(df_ytd_ant["VALORVENDA"].sum()) if not df_ytd_ant.empty else 0.0
        fr_ytd_ant = float(df_ytd_ant["FRETE"].sum()) if not df_ytd_ant.empty else 0.0
        dv_ytd_ant = float(df_ytd_ant["VALORDEVOLUCAO"].sum()) if not df_ytd_ant.empty else 0.0
        fat_ytd_ant = vb_ytd_ant - fr_ytd_ant - dv_ytd_ant
        itens_ytd_ant = int(df_ytd_ant["QTDVENDIDA"].sum()) if not df_ytd_ant.empty else 0
        dev_pct_ytd_ant = round((dv_ytd_ant / vb_ytd_ant * 100), 2) if vb_ytd_ant > 0 else 0.0

        diff_fat_ytd_yoy_pct = round((fat_ytd - fat_ytd_ant) / fat_ytd_ant * 100, 1) if fat_ytd_ant > 0 else 0.0
        diff_itens_ytd_yoy_pct = round((itens_ytd - itens_ytd_ant) / itens_ytd_ant * 100, 1) if itens_ytd_ant > 0 else 0.0
        diff_dev_ytd_pp = round(dev_pct_ytd - dev_pct_ytd_ant, 2)

        meta_ytd_total = 0.0
        if ano == 2026:
            for m_i in range(1, mes_corte):
                if canal_filtro and canal_filtro != "Todos":
                    meta_ytd_total += get_meta_valor(canal_filtro, m_i, versao=1)
                else:
                    meta_ytd_total += get_total_meta_mes(m_i, versao=1, incluir_parlux=False)
            _, d_ult = calendar.monthrange(ano, mes_corte)
            if canal_filtro and canal_filtro != "Todos":
                m_ult = get_meta_valor(canal_filtro, mes_corte, versao=1)
            else:
                m_ult = get_total_meta_mes(mes_corte, versao=1, incluir_parlux=False)
            meta_ytd_total += (m_ult / d_ult) * dia_corte
        meta_ytd_total = round(meta_ytd_total, 2)
        ating_meta_ytd_pct = round((fat_ytd / meta_ytd_total * 100), 1) if meta_ytd_total > 0 else 0.0

        # 3. Construção dos 6 Gráficos de Evolução Diária Acumulada
        # Gráficos: 5 Canais + 1 Geral Consolidado (Verde: Meta, Vermelho: Fat Atual, Azul: Mês Anterior)
        graficos_canais = {}
        for canal in CANAIS_OFICIAIS:
            meta_mes_c = 0.0
            for a in anos:
                for m in meses:
                    if a == 2026:
                        meta_mes_c += get_meta_valor(canal, m, versao=1)
            meta_dia_c = meta_mes_c / total_dias_mes if total_dias_mes > 0 else 0.0
            
            df_c = df[df["CANAL"] == canal] if not df.empty else None
            df_c_ant = df_ant[df_ant["CANAL"] == canal] if not df_ant.empty else None
            
            # Pré-agrupamento instantâneo por dia (O(1) lookup em vez de filtro linear a cada dia)
            fat_dia_map = df_c.groupby("DIA")["FAT_LIQUIDO"].sum().to_dict() if df_c is not None and not df_c.empty else {}
            fat_ant_dia_map = df_c_ant.groupby("DIA")["FAT_LIQUIDO"].sum().to_dict() if df_c_ant is not None and not df_c_ant.empty else {}
            
            # Acumulados dia a dia
            labels = []
            acum_meta_list = []
            acum_fat_list = []
            acum_fat_ant_list = []
            
            soma_real = 0.0
            soma_meta = 0.0
            soma_ant = 0.0
            
            for d in range(1, dia_fim + 1):
                labels.append(str(d))
                soma_meta += meta_dia_c
                acum_meta_list.append(round(soma_meta, 2))
                
                fat_d = float(fat_dia_map.get(d, 0.0))
                soma_real += fat_d
                acum_fat_list.append(round(soma_real, 2))

                fat_d_ant = float(fat_ant_dia_map.get(d, 0.0))
                soma_ant += fat_d_ant
                acum_fat_ant_list.append(round(soma_ant, 2))

            # Se o canal teve vendas no mês anterior mas o intervalo homologo ficou em 0 (ex: MAGALU):
            fat_ant_cheio_c = float(df_c_ant["FAT_LIQUIDO"].sum()) if df_c_ant is not None and not df_c_ant.empty else 0.0
            if soma_ant == 0.0 and fat_ant_cheio_c > 0.0:
                soma_ant = fat_ant_cheio_c
                acum_fat_ant_list = [round((fat_ant_cheio_c / dia_fim) * d, 2) for d in range(1, dia_fim + 1)]
                
            ating_c_periodo = round((soma_real / soma_meta * 100), 1) if soma_meta > 0 else 0.0
            fat_dia_c = round(soma_real / dias_no_periodo, 2) if dias_no_periodo > 0 else 0.0
            meta_dia_c_val = round(soma_meta / dias_no_periodo, 2) if dias_no_periodo > 0 else 0.0
            gap_c_periodo = round(soma_real - soma_meta, 2)
            diff_pct_c_periodo = round(ating_c_periodo - 100.0, 1)
            
            proj_c = round(fat_dia_c * total_dias_mes, 2)
            proj_pct_c = round((proj_c / meta_mes_c * 100), 1) if meta_mes_c > 0 else 0.0
            gap_proj_c = round(proj_c - meta_mes_c, 2)

            # Cálculo de Maior Dia de Venda e Top Produto
            df_c_periodo = df_c[(df_c["DIA"] >= dia_ini) & (df_c["DIA"] <= dia_fim)] if df_c is not None and not df_c.empty else pd.DataFrame()
            rec_dia = 0
            rec_data_str = "—"
            rec_fat = 0.0
            rec_prod_dia = "—"
            rec_prod_dia_full = "—"
            rec_prod_dia_fat = 0.0
            rec_prod_dia_qtd = 0
            rec_prod_per = "—"
            rec_prod_per_full = "—"
            rec_prod_per_fat = 0.0
            rec_prod_per_qtd = 0

            if not df_c_periodo.empty:
                vendas_dias_validos = {d: fat_dia_map.get(d, 0.0) for d in range(dia_ini, dia_fim + 1)}
                if vendas_dias_validos and max(vendas_dias_validos.values()) > 0:
                    rec_dia = int(max(vendas_dias_validos, key=vendas_dias_validos.get))
                    rec_fat = float(vendas_dias_validos[rec_dia])
                    df_rec_dia = df_c_periodo[df_c_periodo["DIA"] == rec_dia]
                    mes_rec = int(df_rec_dia["MES"].iloc[0]) if "MES" in df_rec_dia.columns else mes
                    rec_data_str = f"{rec_dia:02d}/{mes_rec:02d}"
                    
                    if not df_rec_dia.empty and "PRODUTO" in df_rec_dia.columns:
                        grp_dia_p = df_rec_dia.groupby("PRODUTO")["FAT_LIQUIDO"].sum()
                        if not grp_dia_p.empty and grp_dia_p.max() > 0:
                            rec_prod_dia_full = str(grp_dia_p.idxmax())
                            rec_prod_dia = simplificar_nome_produto(rec_prod_dia_full)
                            rec_prod_dia_fat = float(grp_dia_p.max())
                            rec_prod_dia_qtd = int(df_rec_dia[df_rec_dia["PRODUTO"] == rec_prod_dia_full]["QTDVENDIDA"].sum())

                    grp_per_p = df_c_periodo.groupby("PRODUTO")["FAT_LIQUIDO"].sum()
                    if not grp_per_p.empty and grp_per_p.max() > 0:
                        rec_prod_per_full = str(grp_per_p.idxmax())
                        rec_prod_per = simplificar_nome_produto(rec_prod_per_full)
                        rec_prod_per_fat = float(grp_per_p.max())
                        rec_prod_per_qtd = int(df_c_periodo[df_c_periodo["PRODUTO"] == rec_prod_per_full]["QTDVENDIDA"].sum())

            # Cálculo do mês completo (1 até max_dias_meses) para resposta instantânea ao arrastar o slider
            fm_labels = []
            fm_acum_meta = []
            fm_acum_fat = []
            fm_acum_fat_ant = []
            fm_s_real = 0.0
            fm_s_meta = 0.0
            fm_s_ant = 0.0
            for d in range(1, max_dias_meses + 1):
                fm_labels.append(str(d))
                fm_s_meta += meta_dia_c
                fm_acum_meta.append(round(fm_s_meta, 2))
                
                fd = float(fat_dia_map.get(d, 0.0))
                fm_s_real += fd
                fm_acum_fat.append(round(fm_s_real, 2))
                
                fda = float(fat_ant_dia_map.get(d, 0.0))
                fm_s_ant += fda
                fm_acum_fat_ant.append(round(fm_s_ant, 2))
                
            if fm_s_ant == 0.0 and fat_ant_cheio_c > 0.0:
                fm_acum_fat_ant = [round((fat_ant_cheio_c / max_dias_meses) * d, 2) for d in range(1, max_dias_meses + 1)]

            graficos_canais[canal] = {
                "canal": canal,
                "labels": labels,
                "acumulado_meta": acum_meta_list,
                "acumulado_fat": acum_fat_list,
                "acumulado_fat_ant": acum_fat_ant_list,
                "full_month": {
                    "labels": fm_labels,
                    "acumulado_meta": fm_acum_meta,
                    "acumulado_fat": fm_acum_fat,
                    "acumulado_fat_ant": fm_acum_fat_ant,
                    "meta_dia": meta_dia_c_val,
                    "meta_mes": round(meta_mes_c, 2)
                },
                "total_fat_periodo": round(soma_real, 2),
                "total_meta_periodo": round(soma_meta, 2),
                "total_fat_ant_periodo": round(soma_ant, 2),
                "atingimento_pct": ating_c_periodo,
                "meta_mes": round(meta_mes_c, 2),
                "venda_dia": fat_dia_c,
                "meta_dia": meta_dia_c_val,
                "gap_periodo": gap_c_periodo,
                "diff_pct_periodo": diff_pct_c_periodo,
                "projecao_mes": proj_c,
                "projecao_pct": proj_pct_c,
                "gap_projecao": gap_proj_c,
                "recorde_dia": {
                    "dia": rec_dia,
                    "data_formatada": rec_data_str,
                    "faturamento": round(rec_fat, 2),
                    "top_produto": rec_prod_dia,
                    "top_produto_full": rec_prod_dia_full,
                    "top_produto_fat": round(rec_prod_dia_fat, 2),
                    "top_produto_qtd": rec_prod_dia_qtd,
                    "top_produto_periodo": rec_prod_per,
                    "top_produto_periodo_full": rec_prod_per_full,
                    "top_produto_periodo_fat": round(rec_prod_per_fat, 2),
                    "top_produto_periodo_qtd": rec_prod_per_qtd
                }
            }

        # Gráfico 6: GERAL (Consolidado)
        labels_geral = []
        acum_meta_geral_list = []
        acum_fat_geral_list = []
        acum_fat_ant_geral_list = []
        soma_meta_g = 0.0
        soma_fat_g = 0.0
        soma_ant_g = 0.0
        for d in range(1, dia_fim + 1):
            labels_geral.append(str(d))
            meta_dia_d = sum(graficos_canais[c]["acumulado_meta"][d-1] - (graficos_canais[c]["acumulado_meta"][d-2] if d > 1 else 0) for c in CANAIS_OFICIAIS if c != "PARLUX")
            soma_meta_g += meta_dia_d
            acum_meta_geral_list.append(round(soma_meta_g, 2))
            
            fat_dia_d = sum(graficos_canais[c]["acumulado_fat"][d-1] - (graficos_canais[c]["acumulado_fat"][d-2] if d > 1 else 0) for c in CANAIS_OFICIAIS if c != "PARLUX")
            soma_fat_g += fat_dia_d
            acum_fat_geral_list.append(round(soma_fat_g, 2))

            fat_ant_dia_d = sum(graficos_canais[c]["acumulado_fat_ant"][d-1] - (graficos_canais[c]["acumulado_fat_ant"][d-2] if d > 1 else 0) for c in CANAIS_OFICIAIS if c != "PARLUX")
            soma_ant_g += fat_ant_dia_d
            acum_fat_ant_geral_list.append(round(soma_ant_g, 2))
            
        ating_geral_pct = round((soma_fat_g / soma_meta_g * 100), 1) if soma_meta_g > 0 else 0.0
        fat_dia_g = round(soma_fat_g / dias_no_periodo, 2) if dias_no_periodo > 0 else 0.0
        meta_dia_g = round(soma_meta_g / dias_no_periodo, 2) if dias_no_periodo > 0 else 0.0
        gap_g_periodo = round(soma_fat_g - soma_meta_g, 2)
        diff_pct_g_periodo = round(ating_geral_pct - 100.0, 1)

        proj_g = round(fat_dia_g * total_dias_mes, 2)
        proj_pct_g = round((proj_g / meta_mes_geral * 100), 1) if meta_mes_geral > 0 else 0.0
        gap_proj_g = round(proj_g - meta_mes_geral, 2)

        df_g_periodo = df_kpis[(df_kpis["DIA"] >= dia_ini) & (df_kpis["DIA"] <= dia_fim)] if not df_kpis.empty else pd.DataFrame()
        rec_dia_g = 0
        rec_data_str_g = "—"
        rec_fat_g = 0.0
        rec_prod_dia_g = "—"
        rec_prod_dia_full_g = "—"
        rec_prod_dia_fat_g = 0.0
        rec_prod_dia_qtd_g = 0
        rec_prod_per_g = "—"
        rec_prod_per_full_g = "—"
        rec_prod_per_fat_g = 0.0
        rec_prod_per_qtd_g = 0

        if not df_g_periodo.empty:
            fat_dias_g = df_g_periodo.groupby("DIA")["FAT_LIQUIDO"].sum().to_dict()
            if fat_dias_g and max(fat_dias_g.values()) > 0:
                rec_dia_g = int(max(fat_dias_g, key=fat_dias_g.get))
                rec_fat_g = float(fat_dias_g[rec_dia_g])
                df_rec_dia_g = df_g_periodo[df_g_periodo["DIA"] == rec_dia_g]
                mes_rec_g = int(df_rec_dia_g["MES"].iloc[0]) if "MES" in df_rec_dia_g.columns else mes
                rec_data_str_g = f"{rec_dia_g:02d}/{mes_rec_g:02d}"

                if not df_rec_dia_g.empty and "PRODUTO" in df_rec_dia_g.columns:
                    grp_dia_pg = df_rec_dia_g.groupby("PRODUTO")["FAT_LIQUIDO"].sum()
                    if not grp_dia_pg.empty and grp_dia_pg.max() > 0:
                        rec_prod_dia_full_g = str(grp_dia_pg.idxmax())
                        rec_prod_dia_g = simplificar_nome_produto(rec_prod_dia_full_g)
                        rec_prod_dia_fat_g = float(grp_dia_pg.max())
                        rec_prod_dia_qtd_g = int(df_rec_dia_g[df_rec_dia_g["PRODUTO"] == rec_prod_dia_full_g]["QTDVENDIDA"].sum())

                grp_per_pg = df_g_periodo.groupby("PRODUTO")["FAT_LIQUIDO"].sum()
                if not grp_per_pg.empty and grp_per_pg.max() > 0:
                    rec_prod_per_full_g = str(grp_per_pg.idxmax())
                    rec_prod_per_g = simplificar_nome_produto(rec_prod_per_full_g)
                    rec_prod_per_fat_g = float(grp_per_pg.max())
                    rec_prod_per_qtd_g = int(df_g_periodo[df_g_periodo["PRODUTO"] == rec_prod_per_full_g]["QTDVENDIDA"].sum())

        # GERAL full_month
        fm_labels_g = [str(d) for d in range(1, max_dias_meses + 1)]
        fm_acum_meta_g = []
        fm_acum_fat_g = []
        fm_acum_fat_ant_g = []
        sm_g = 0.0
        sf_g = 0.0
        sa_g = 0.0
        for d in range(1, max_dias_meses + 1):
            md = sum(graficos_canais[c]["full_month"]["acumulado_meta"][d-1] - (graficos_canais[c]["full_month"]["acumulado_meta"][d-2] if d > 1 else 0) for c in CANAIS_OFICIAIS if c != "PARLUX")
            sm_g += md
            fm_acum_meta_g.append(round(sm_g, 2))
            
            fd = sum(graficos_canais[c]["full_month"]["acumulado_fat"][d-1] - (graficos_canais[c]["full_month"]["acumulado_fat"][d-2] if d > 1 else 0) for c in CANAIS_OFICIAIS if c != "PARLUX")
            sf_g += fd
            fm_acum_fat_g.append(round(sf_g, 2))
            
            fa = sum(graficos_canais[c]["full_month"]["acumulado_fat_ant"][d-1] - (graficos_canais[c]["full_month"]["acumulado_fat_ant"][d-2] if d > 1 else 0) for c in CANAIS_OFICIAIS if c != "PARLUX")
            sa_g += fa
            fm_acum_fat_ant_g.append(round(sa_g, 2))

        graficos_canais["GERAL"] = {
            "canal": "GERAL",
            "labels": labels_geral,
            "acumulado_meta": acum_meta_geral_list,
            "acumulado_fat": acum_fat_geral_list,
            "acumulado_fat_ant": acum_fat_ant_geral_list,
            "full_month": {
                "labels": fm_labels_g,
                "acumulado_meta": fm_acum_meta_g,
                "acumulado_fat": fm_acum_fat_g,
                "acumulado_fat_ant": fm_acum_fat_ant_g,
                "meta_dia": meta_dia_g,
                "meta_mes": round(meta_mes_geral, 2)
            },
            "total_fat_periodo": round(soma_fat_g, 2),
            "total_meta_periodo": round(soma_meta_g, 2),
            "total_fat_ant_periodo": round(soma_ant_g, 2),
            "atingimento_pct": ating_geral_pct,
            "meta_mes": round(meta_mes_geral, 2),
            "venda_dia": fat_dia_g,
            "meta_dia": meta_dia_g,
            "gap_periodo": gap_g_periodo,
            "diff_pct_periodo": diff_pct_g_periodo,
            "projecao_mes": proj_g,
            "projecao_pct": proj_pct_g,
            "gap_projecao": gap_proj_g,
            "recorde_dia": {
                "dia": rec_dia_g,
                "data_formatada": rec_data_str_g,
                "faturamento": round(rec_fat_g, 2),
                "top_produto": rec_prod_dia_g,
                "top_produto_full": rec_prod_dia_full_g,
                "top_produto_fat": round(rec_prod_dia_fat_g, 2),
                "top_produto_qtd": rec_prod_dia_qtd_g,
                "top_produto_periodo": rec_prod_per_g,
                "top_produto_periodo_full": rec_prod_per_full_g,
                "top_produto_periodo_fat": round(rec_prod_per_fat_g, 2),
                "top_produto_periodo_qtd": rec_prod_per_qtd_g
            }
        }

        # 4. Tabela Detalhada por Canal no Período (sem Parlux conforme solicitação da Diretoria)
        canais_tabela = []
        canais_para_tabela = [c for c in CANAIS_OFICIAIS if c != "PARLUX"] if canal_filtro != "PARLUX" else ["PARLUX"]
        fat_liquido_total_tabela = sum(graficos_canais[c]["total_fat_periodo"] for c in canais_para_tabela)
        fat_ant_total_tabela = sum(graficos_canais[c]["total_fat_ant_periodo"] for c in canais_para_tabela)

        # Mesmo período no ano anterior (2025): mesmos meses e mesmo intervalo de dias
        df_periodo_ano_ant = df_ano_ant_filt[
            (df_ano_ant_filt["MES"].isin(meses)) &
            (df_ano_ant_filt["DIA"] >= dia_ini) &
            (df_ano_ant_filt["DIA"] <= dia_fim)
        ] if not df_ano_ant_filt.empty else pd.DataFrame()

        fat_ano_ant_canais = {}
        for canal in canais_para_tabela:
            df_c_ano_ant = df_periodo_ano_ant[df_periodo_ano_ant["CANAL"] == canal] if not df_periodo_ano_ant.empty else pd.DataFrame()
            if not df_c_ano_ant.empty:
                vb_aa = float(df_c_ano_ant["VALORVENDA"].sum())
                fr_aa = float(df_c_ano_ant["FRETE"].sum())
                dev_aa = float(df_c_ano_ant["VALORDEVOLUCAO"].sum())
                fat_ano_ant_canais[canal] = vb_aa - fr_aa - dev_aa
            else:
                fat_ano_ant_canais[canal] = 0.0

        fat_ano_ant_total_tabela = sum(fat_ano_ant_canais.values())

        for canal in canais_para_tabela:
            info = graficos_canais[canal]
            real_c = info["total_fat_periodo"]
            meta_per_c = info["total_meta_periodo"]
            meta_mes_c = info["meta_mes"]
            
            df_c_per = df_periodo[df_periodo["CANAL"] == canal] if not df_periodo.empty else None
            vb_c = float(df_c_per["VALORVENDA"].sum()) if df_c_per is not None and not df_c_per.empty else 0.0
            fr_c = float(df_c_per["FRETE"].sum()) if df_c_per is not None and not df_c_per.empty else 0.0
            dev_c = float(df_c_per["VALORDEVOLUCAO"].sum()) if df_c_per is not None and not df_c_per.empty else 0.0
            itens_c = int(df_c_per["QTDVENDIDA"].sum()) if df_c_per is not None and not df_c_per.empty else 0
            pedidos_c = int(df_c_per["NUNOTA"].nunique()) if df_c_per is not None and not df_c_per.empty else 0
            
            tm_c = round(real_c / itens_c, 2) if itens_c > 0 else 0.0
            dev_pct_c = round((dev_c / vb_c * 100), 2) if vb_c > 0 else 0.0
            share_c = round((real_c / fat_liquido_total_tabela * 100), 2) if fat_liquido_total_tabela > 0 else 0.0
            
            med_dia_c = real_c / dias_no_periodo if dias_no_periodo > 0 else 0.0
            proj_c = round(med_dia_c * total_dias_mes, 2)
            fat_ant_c = info["total_fat_ant_periodo"]
            cresc_mom = round((real_c - fat_ant_c) / fat_ant_c * 100, 1) if fat_ant_c > 0 else 0.0
            share_ant_c = round((fat_ant_c / fat_ant_total_tabela * 100), 2) if fat_ant_total_tabela > 0 else 0.0
            
            fat_ano_ant_c = fat_ano_ant_canais.get(canal, 0.0)
            share_ano_ant_c = round((fat_ano_ant_c / fat_ano_ant_total_tabela * 100), 2) if fat_ano_ant_total_tabela > 0 else 0.0
            diff_share_mom_c = round(share_c - share_ant_c, 2)
            diff_share_ano_ant_c = round(share_c - share_ano_ant_c, 2)
            
            canais_tabela.append({
                "canal": canal,
                "venda_bruta": round(vb_c, 2),
                "frete": round(fr_c, 2),
                "devolucao": round(dev_c, 2),
                "pct_devolucao": dev_pct_c,
                "faturamento_liquido": round(real_c, 2),
                "faturamento_ant": round(fat_ant_c, 2),
                "faturamento_ano_ant": round(fat_ano_ant_c, 2),
                "crescimento_mom": cresc_mom,
                "meta_periodo": round(meta_per_c, 2),
                "meta_mes": round(meta_mes_c, 2),
                "atingimento_periodo_pct": info["atingimento_pct"],
                "atingimento_mes_pct": round((real_c / meta_mes_c * 100), 1) if meta_mes_c > 0 else 0.0,
                "projecao_mes": proj_c,
                "itens": itens_c,
                "pedidos": pedidos_c,
                "ticket_medio": tm_c,
                "share_pct": share_c,
                "share_ant_pct": share_ant_c,
                "share_ano_ant_pct": share_ano_ant_c,
                "diff_share_mom": diff_share_mom_c,
                "diff_share_ano_ant": diff_share_ano_ant_c,
                "status": "superou" if info["atingimento_pct"] >= 100 else ("atencao" if info["atingimento_pct"] >= 75 else "critico")
            })

        # 4.1. Cards Executivos de Projeção por Canal (Replicando estrutura do card Projeção do Mês)
        projecoes_canais = {}
        for canal in CANAIS_OFICIAIS:
            info_c = graficos_canais.get(canal, {})
            proj_c = info_c.get("projecao_mes", 0.0)
            proj_pct_c = info_c.get("projecao_pct", 0.0)
            meta_mes_c = info_c.get("meta_mes", 0.0)

            # MoM: Mês anterior fechado (total)
            df_ant_c = df_ant[df_ant["CANAL"] == canal] if not df_ant.empty else pd.DataFrame()
            vb_ant_c = float(df_ant_c["VALORVENDA"].sum()) if not df_ant_c.empty else 0.0
            fr_ant_c = float(df_ant_c["FRETE"].sum()) if not df_ant_c.empty else 0.0
            dv_ant_c = float(df_ant_c["VALORDEVOLUCAO"].sum()) if not df_ant_c.empty else 0.0
            fat_ant_cheio_c = round(vb_ant_c - fr_ant_c - dv_ant_c, 2)
            diff_proj_mom_c = round((proj_c - fat_ant_cheio_c) / fat_ant_cheio_c * 100, 1) if fat_ant_cheio_c > 0 else 0.0

            # YTD: Acumulado do ano vs Meta acumulada do canal
            df_ytd_c = df_ytd_atual[df_ytd_atual["CANAL"] == canal] if not df_ytd_atual.empty else pd.DataFrame()
            vb_ytd_c = float(df_ytd_c["VALORVENDA"].sum()) if not df_ytd_c.empty else 0.0
            fr_ytd_c = float(df_ytd_c["FRETE"].sum()) if not df_ytd_c.empty else 0.0
            dv_ytd_c = float(df_ytd_c["VALORDEVOLUCAO"].sum()) if not df_ytd_c.empty else 0.0
            fat_ytd_c = round(vb_ytd_c - fr_ytd_c - dv_ytd_c, 2)

            meta_ytd_c = 0.0
            if ano == 2026:
                for m_i in range(1, mes_corte):
                    meta_ytd_c += get_meta_valor(canal, m_i, versao=1)
                _, d_ult = calendar.monthrange(ano, mes_corte)
                m_ult_c = get_meta_valor(canal, mes_corte, versao=1)
                meta_ytd_c += (m_ult_c / d_ult) * dia_corte
            meta_ytd_c = round(meta_ytd_c, 2)
            ating_meta_ytd_c = round((fat_ytd_c / meta_ytd_c * 100), 1) if meta_ytd_c > 0 else 0.0

            chave_canal = (
                "ml" if "MERCADO LIVRE" in canal
                else "shopee" if "SHOPEE" in canal
                else "vtex" if "VTEX" in canal
                else "magalu" if "MAGALU" in canal
                else "parlux"
            )

            projecoes_canais[chave_canal] = {
                "canal": canal,
                "chave": chave_canal,
                "projecao_mes": proj_c,
                "projecao_pct": proj_pct_c,
                "meta_mes": meta_mes_c,
                "fat_ant_mes_cheio": fat_ant_cheio_c,
                "diff_proj_mom_pct": diff_proj_mom_c,
                "fat_ytd": fat_ytd_c,
                "meta_ytd": meta_ytd_c,
                "ating_meta_ytd_pct": ating_meta_ytd_c
            }

        # 5. Histórico Mensal 2026 com Comparativo YoY (2025) e Mês Anterior (M-1)
        # Reutiliza o DataFrame do ano já carregado no YTD (zero overhead de I/O)
        df_ano = df_ano_total.copy() if not df_ano_total.empty else pd.DataFrame()
        df_ano_ant = df_ano_ant_total.copy() if not df_ano_ant_total.empty else pd.DataFrame()
        historico_mensal = []
        if not df_ano.empty:
            df_ano_canais = df_ano[df_ano["CANAL"].isin(CANAIS_OFICIAIS)].copy()
            df_ano_ant_canais = df_ano_ant[df_ano_ant["CANAL"].isin(CANAIS_OFICIAIS)].copy() if not df_ano_ant.empty else pd.DataFrame()

            if marca_filtro and marca_filtro != "Todas":
                df_ano_canais = df_ano_canais[df_ano_canais["MARCA"] == marca_filtro.upper()]
                if not df_ano_ant_canais.empty:
                    df_ano_ant_canais = df_ano_ant_canais[df_ano_ant_canais["MARCA"] == marca_filtro.upper()]
            if canal_filtro and canal_filtro != "Todos":
                df_ano_canais = df_ano_canais[df_ano_canais["CANAL"] == canal_filtro.upper()]
                if not df_ano_ant_canais.empty:
                    df_ano_ant_canais = df_ano_ant_canais[df_ano_ant_canais["CANAL"] == canal_filtro.upper()]

            # Dados de Dezembro do ano anterior para M-1 de Janeiro
            df_dez_ant = carregar_vendas_ecommerce(ano=ano-1, mes=12, force_refresh=False)
            if not df_dez_ant.empty:
                df_dez_ant = df_dez_ant[df_dez_ant["CANAL"].isin(CANAIS_OFICIAIS)]
                if marca_filtro and marca_filtro != "Todas":
                    df_dez_ant = df_dez_ant[df_dez_ant["MARCA"] == marca_filtro.upper()]
                if canal_filtro and canal_filtro != "Todos":
                    df_dez_ant = df_dez_ant[df_dez_ant["CANAL"] == canal_filtro.upper()]
            
            # Pré-agrupamento por mês do ano 2026 (zero filtragens repetidas)
            mes_agg_map = df_ano_canais.groupby("MES")[["VALORVENDA", "FRETE", "VALORDEVOLUCAO", "QTDVENDIDA"]].sum().to_dict('index')
            # Pré-agrupamento por mês do ano 2025 (ano anterior)
            mes_agg_map_ant = df_ano_ant_canais.groupby("MES")[["VALORVENDA", "FRETE", "VALORDEVOLUCAO", "QTDVENDIDA"]].sum().to_dict('index') if not df_ano_ant_canais.empty else {}
            
            max_mes = max(meses) if meses else 10
            for m_num in range(1, max_mes + 1): # Todos os meses no mesmo período selecionado (dia_ini até dia_fim)
                # Filtra mês corrente e comparativos exatamente no período selecionado (dia_ini até dia_fim)
                df_m = df_ano_canais[(df_ano_canais["MES"] == m_num) & (df_ano_canais["DIA"] >= dia_ini) & (df_ano_canais["DIA"] <= dia_fim)]
                vb_m = float(df_m["VALORVENDA"].sum()) if not df_m.empty else 0.0
                fr_m = float(df_m["FRETE"].sum()) if not df_m.empty else 0.0
                dv_m = float(df_m["VALORDEVOLUCAO"].sum()) if not df_m.empty else 0.0
                it_m = int(df_m["QTDVENDIDA"].sum()) if not df_m.empty else 0

                # Comparativo com mês anterior (M-1) no mesmo período dia_ini até dia_fim
                if m_num == 1:
                    df_prev = df_dez_ant[(df_dez_ant["DIA"] >= dia_ini) & (df_dez_ant["DIA"] <= dia_fim)] if not df_dez_ant.empty else pd.DataFrame()
                else:
                    df_prev = df_ano_canais[(df_ano_canais["MES"] == m_num - 1) & (df_ano_canais["DIA"] >= dia_ini) & (df_ano_canais["DIA"] <= dia_fim)]
                
                vb_p = float(df_prev["VALORVENDA"].sum()) if not df_prev.empty else 0.0
                fr_p = float(df_prev["FRETE"].sum()) if not df_prev.empty else 0.0
                dv_p = float(df_prev["VALORDEVOLUCAO"].sum()) if not df_prev.empty else 0.0
                it_p = int(df_prev["QTDVENDIDA"].sum()) if not df_prev.empty else 0

                # Comparativo com ano anterior 2025 no mesmo período dia_ini até dia_fim
                df_25 = df_ano_ant_canais[(df_ano_ant_canais["MES"] == m_num) & (df_ano_ant_canais["DIA"] >= dia_ini) & (df_ano_ant_canais["DIA"] <= dia_fim)] if not df_ano_ant_canais.empty else pd.DataFrame()
                vb_25 = float(df_25["VALORVENDA"].sum()) if not df_25.empty else 0.0
                fr_25 = float(df_25["FRETE"].sum()) if not df_25.empty else 0.0
                dv_25 = float(df_25["VALORDEVOLUCAO"].sum()) if not df_25.empty else 0.0
                it_25 = int(df_25["QTDVENDIDA"].sum()) if not df_25.empty else 0

                fl_m = vb_m - fr_m - dv_m
                tm_m = round(fl_m / it_m, 2) if it_m > 0 else 0.0

                fl_p = vb_p - fr_p - dv_p
                tm_p = round(fl_p / it_p, 2) if it_p > 0 else 0.0

                fl_25 = vb_25 - fr_25 - dv_25
                tm_25 = round(fl_25 / it_25, 2) if it_25 > 0 else 0.0

                var_fl = round(((fl_m - fl_p) / fl_p * 100), 1) if fl_p > 0 else 0.0
                var_it = round(((it_m - it_p) / it_p * 100), 1) if it_p > 0 else 0.0
                var_tm = round(((tm_m - tm_p) / tm_p * 100), 1) if tm_p > 0 else 0.0
                var_dv = round(((dv_m - dv_p) / dv_p * 100), 1) if dv_p > 0 else 0.0

                var_fl_25 = round(((fl_m - fl_25) / fl_25 * 100), 1) if fl_25 > 0 else 0.0
                var_it_25 = round(((it_m - it_25) / it_25 * 100), 1) if it_25 > 0 else 0.0
                var_tm_25 = round(((tm_m - tm_25) / tm_25 * 100), 1) if tm_25 > 0 else 0.0
                var_dv_25 = round(((dv_m - dv_25) / dv_25 * 100), 1) if dv_25 > 0 else 0.0

                historico_mensal.append({
                    "mes": m_num,
                    "mes_abrev": NOMES_MESES[m_num-1][:3].lower(),
                    "mes_nome": NOMES_MESES[m_num-1],
                    "faturamento": round(fl_m, 2),
                    "faturamento_ant": round(fl_p, 2),
                    "faturamento_diff_pct": var_fl,
                    "faturamento_2025": round(fl_25, 2),
                    "faturamento_diff_2025_pct": var_fl_25,
                    "itens": it_m,
                    "itens_ant": it_p,
                    "itens_diff_pct": var_it,
                    "itens_2025": it_25,
                    "itens_diff_2025_pct": var_it_25,
                    "ticket_medio": tm_m,
                    "ticket_medio_ant": tm_p,
                    "ticket_medio_diff_pct": var_tm,
                    "ticket_medio_2025": tm_25,
                    "ticket_medio_diff_2025_pct": var_tm_25,
                    "devolucoes": round(dv_m, 2),
                    "devolucoes_ant": round(dv_p, 2),
                    "devolucoes_diff_pct": var_dv,
                    "devolucoes_2025": round(dv_25, 2),
                    "devolucoes_diff_2025_pct": var_dv_25
                })

        # 6. Produtos Mais Vendidos no Geral (Consolidado E-commerce - Sem Canal de Vendas)
        df_curr_mat = df_periodo.copy()
        if not df_ant.empty:
            df_prev_mat = df_ant[(df_ant["DIA"] >= dia_ini) & (df_ant["DIA"] <= dia_fim)].copy()
            if df_prev_mat.empty and not df_ant.empty:
                df_prev_mat = df_ant.copy()
        else:
            df_prev_mat = df_curr_mat.iloc[0:0].copy()

        # Dicionários de lookup ultra-rápidos O(1) do Mês Anterior
        prev_prods_fat_dict = df_prev_mat.groupby("PRODUTO")["FAT_LIQUIDO"].sum().to_dict() if not df_prev_mat.empty else {}
        prev_prods_qtd_dict = df_prev_mat.groupby("PRODUTO")["QTDVENDIDA"].sum().to_dict() if not df_prev_mat.empty else {}

        # Mapa de Ranking de Produtos no Mês Anterior
        prev_prods_ordenados = sorted(prev_prods_fat_dict.items(), key=lambda x: x[1], reverse=True)
        rank_prev_map = {prod: idx + 1 for idx, (prod, _) in enumerate(prev_prods_ordenados)}

        # 6.1. Ranking Geral Consolidado de Produtos
        prods_geral_agg = df_curr_mat.groupby("PRODUTO").agg({
            "QTDVENDIDA": "sum",
            "FAT_LIQUIDO": "sum",
            "SKU_MQ": "first",
            "GRUPO_SINTETICO": "first"
        }).sort_values(by="FAT_LIQUIDO", ascending=False)

        # Mapa de quantidade por canal no período atual para cálculo de share QTD por canal
        qtd_canal_mat_map = df_curr_mat.groupby("CANAL")["QTDVENDIDA"].sum().to_dict() if not df_curr_mat.empty else {}

        lista_ranking_produtos = []
        rank_idx = 1
        for prod_val, r in prods_geral_agg.iterrows():
            qtd_p = int(r["QTDVENDIDA"])
            fat_p = float(r["FAT_LIQUIDO"])

            # % QTD em relação ao canal correspondente (onde o produto teve maior volume de vendas)
            g_prod_canais = df_curr_mat[df_curr_mat["PRODUTO"] == prod_val].groupby("CANAL")["QTDVENDIDA"].sum() if not df_curr_mat.empty else pd.Series()
            if not g_prod_canais.empty and g_prod_canais.max() > 0:
                top_cn = str(g_prod_canais.idxmax())
                qtd_top_cn = float(qtd_canal_mat_map.get(top_cn, qtd_itens_total))
                qtd_p_cn = float(g_prod_canais.max())
                pct_p = round(float(qtd_p_cn / qtd_top_cn * 100), 2) if qtd_top_cn > 0 else 0.0
            else:
                top_cn = "GERAL"
                pct_p = round(float(qtd_p / qtd_itens_total * 100), 2) if qtd_itens_total > 0 else 0.0

            vm_p = round(float(fat_p / qtd_p), 2) if qtd_p > 0 else 0.0

            prev_qtd_p = float(prev_prods_qtd_dict.get(prod_val, 0.0))
            evol_p = round(float((qtd_p - prev_qtd_p) / prev_qtd_p * 100), 2) if prev_qtd_p > 0 else (100.0 if qtd_p > 0 else 0.0)

            # Comparação de Ranking vs Mês Anterior
            rank_ant = rank_prev_map.get(prod_val, None)
            if rank_ant is not None:
                rank_diff = rank_ant - rank_idx
            else:
                rank_diff = None

            lista_ranking_produtos.append({
                "rank": rank_idx,
                "rank_ant": rank_ant,
                "rank_diff": rank_diff,
                "nome": str(prod_val),
                "sku": str(r["SKU_MQ"] or ""),
                "categoria": str(r["GRUPO_SINTETICO"] or "OUTROS"),
                "canal": top_cn,
                "qtd": qtd_p,
                "fat": round(fat_p, 2),
                "pct": pct_p,
                "vlr_medio": vm_p,
                "evolucao_pct": evol_p
            })
            rank_idx += 1

        # 6.2. Agrupamento por Categoria (Geral sem divisão por canal)
        prev_cats_fat_dict = df_prev_mat.groupby("GRUPO_SINTETICO")["FAT_LIQUIDO"].sum().to_dict() if not df_prev_mat.empty else {}
        prev_cats_qtd_dict = df_prev_mat.groupby("GRUPO_SINTETICO")["QTDVENDIDA"].sum().to_dict() if not df_prev_mat.empty else {}
        prev_cats_ordenadas = sorted(prev_cats_fat_dict.items(), key=lambda x: x[1], reverse=True)
        rank_prev_cat_map = {cat: idx + 1 for idx, (cat, _) in enumerate(prev_cats_ordenadas)}

        # Dicionários de produtos por categoria no mês anterior O(1)
        prev_cat_prod_fat_dict = df_prev_mat.groupby(["GRUPO_SINTETICO", "PRODUTO"])["FAT_LIQUIDO"].sum().to_dict() if not df_prev_mat.empty else {}
        prev_cat_prod_qtd_dict = df_prev_mat.groupby(["GRUPO_SINTETICO", "PRODUTO"])["QTDVENDIDA"].sum().to_dict() if not df_prev_mat.empty else {}

        lista_categorias = []
        cat_totais = df_curr_mat.groupby("GRUPO_SINTETICO")["FAT_LIQUIDO"].sum().sort_values(ascending=False)
        cat_idx = 1
        for cat_val in cat_totais.index:
            g_cat = df_curr_mat[df_curr_mat["GRUPO_SINTETICO"] == cat_val]

            qtd_c = int(g_cat["QTDVENDIDA"].sum())
            fat_c = float(g_cat["FAT_LIQUIDO"].sum())
            pct_c = round(float(qtd_c / qtd_itens_total * 100), 2) if qtd_itens_total > 0 else 0.0
            vm_c = round(float(fat_c / qtd_c), 2) if qtd_c > 0 else 0.0
            prev_qtd_c = float(prev_cats_qtd_dict.get(cat_val, 0.0))
            evol_c = round(float((qtd_c - prev_qtd_c) / prev_qtd_c * 100), 2) if prev_qtd_c > 0 else (100.0 if qtd_c > 0 else 0.0)

            cat_rank_ant = rank_prev_cat_map.get(cat_val, None)
            cat_rank_diff = cat_rank_ant - cat_idx if cat_rank_ant is not None else None

            # Ranking de produtos da categoria no mês anterior O(1)
            cat_prev_prods = [(p, f) for (c, p), f in prev_cat_prod_fat_dict.items() if c == cat_val]
            cat_prev_prods.sort(key=lambda x: x[1], reverse=True)
            rank_prev_prod_cat_map = {p: idx + 1 for idx, (p, _) in enumerate(cat_prev_prods)}

            prods_cat_agg = g_cat.groupby("PRODUTO").agg({
                "QTDVENDIDA": "sum",
                "FAT_LIQUIDO": "sum",
                "SKU_MQ": "first"
            }).sort_values(by="FAT_LIQUIDO", ascending=False)

            prods_cat = []
            prod_cat_idx = 1
            for prod_val, r in prods_cat_agg.iterrows():
                qtd_cp = int(r["QTDVENDIDA"])
                fat_cp = float(r["FAT_LIQUIDO"])
                pct_cp = round(float(qtd_cp / qtd_c * 100), 2) if qtd_c > 0 else 0.0
                vm_cp = round(float(fat_cp / qtd_cp), 2) if qtd_cp > 0 else 0.0
                prev_qtd_cp = float(prev_cat_prod_qtd_dict.get((cat_val, prod_val), 0.0))
                evol_cp = round(float((qtd_cp - prev_qtd_cp) / prev_qtd_cp * 100), 2) if prev_qtd_cp > 0 else (100.0 if qtd_cp > 0 else 0.0)

                prod_cat_rank_ant = rank_prev_prod_cat_map.get(prod_val, None)
                prod_cat_rank_diff = prod_cat_rank_ant - prod_cat_idx if prod_cat_rank_ant is not None else None

                prods_cat.append({
                    "rank": prod_cat_idx,
                    "rank_ant": prod_cat_rank_ant,
                    "rank_diff": prod_cat_rank_diff,
                    "nome": str(prod_val),
                    "sku": str(r["SKU_MQ"] or ""),
                    "categoria": str(cat_val),
                    "qtd": qtd_cp,
                    "fat": round(fat_cp, 2),
                    "pct": pct_cp,
                    "vlr_medio": vm_cp,
                    "evolucao_pct": evol_cp
                })
                prod_cat_idx += 1

            lista_categorias.append({
                "id": str(cat_val).replace(" ", "_"),
                "nome": str(cat_val or "OUTROS"),
                "rank": cat_idx,
                "rank_ant": cat_rank_ant,
                "rank_diff": cat_rank_diff,
                "qtd": qtd_c,
                "fat": round(fat_c, 2),
                "pct": pct_c,
                "vlr_medio": vm_c,
                "evolucao_pct": evol_c,
                "produtos": prods_cat
            })
            cat_idx += 1

        # 6.3. Agrupamento por Canal de Vendas Oficial
        lista_canais_prods = []
        canais_matriz = [c for c in CANAIS_OFICIAIS if c != "PARLUX"]
        canal_m_idx = 1
        for c_nome in canais_matriz:
            g_cn = df_curr_mat[df_curr_mat["CANAL"] == c_nome] if not df_curr_mat.empty else pd.DataFrame()
            qtd_cn = int(g_cn["QTDVENDIDA"].sum()) if not g_cn.empty else 0
            fat_cn = float(g_cn["FAT_LIQUIDO"].sum()) if not g_cn.empty else 0.0
            pct_cn = round(float(qtd_cn / qtd_itens_total * 100), 2) if qtd_itens_total > 0 else 0.0
            vm_cn = round(float(fat_cn / qtd_cn), 2) if qtd_cn > 0 else 0.0

            g_cn_ant = df_prev_mat[df_prev_mat["CANAL"] == c_nome] if not df_prev_mat.empty else pd.DataFrame()
            prev_qtd_cn = float(g_cn_ant["QTDVENDIDA"].sum()) if not g_cn_ant.empty else 0.0
            evol_cn = round(float((qtd_cn - prev_qtd_cn) / prev_qtd_cn * 100), 2) if prev_qtd_cn > 0 else (100.0 if qtd_cn > 0 else 0.0)

            prods_canal = []
            if not g_cn.empty:
                prods_cn_agg = g_cn.groupby("PRODUTO").agg({
                    "QTDVENDIDA": "sum",
                    "FAT_LIQUIDO": "sum",
                    "SKU_MQ": "first"
                }).sort_values(by="FAT_LIQUIDO", ascending=False)

                prod_cn_idx = 1
                for p_nome, r in prods_cn_agg.iterrows():
                    qtd_p = int(r["QTDVENDIDA"])
                    fat_p = float(r["FAT_LIQUIDO"])
                    pct_p = round(float(qtd_p / qtd_cn * 100), 2) if qtd_cn > 0 else 0.0
                    vm_p = round(float(fat_p / qtd_p), 2) if qtd_p > 0 else 0.0

                    g_p_ant = g_cn_ant[g_cn_ant["PRODUTO"] == p_nome] if not g_cn_ant.empty else pd.DataFrame()
                    prev_qtd_p = float(g_p_ant["QTDVENDIDA"].sum()) if not g_p_ant.empty else 0.0
                    evol_p = round(float((qtd_p - prev_qtd_p) / prev_qtd_p * 100), 2) if prev_qtd_p > 0 else (100.0 if qtd_p > 0 else 0.0)

                    prods_canal.append({
                        "rank": prod_cn_idx,
                        "nome": str(p_nome),
                        "sku": str(r["SKU_MQ"] or ""),
                        "canal": str(c_nome),
                        "qtd": qtd_p,
                        "fat": round(fat_p, 2),
                        "pct": pct_p,
                        "vlr_medio": vm_p,
                        "evolucao_pct": evol_p
                    })
                    prod_cn_idx += 1

            lista_canais_prods.append({
                "id": str(c_nome).replace(" ", "_"),
                "nome": str(c_nome),
                "rank": canal_m_idx,
                "qtd": qtd_cn,
                "fat": round(fat_cn, 2),
                "pct": pct_cn,
                "vlr_medio": vm_cn,
                "evolucao_pct": evol_cn,
                "produtos": prods_canal
            })
            canal_m_idx += 1

        prev_qtd_geral = float(df_prev_mat["QTDVENDIDA"].sum()) if not df_prev_mat.empty else 0.0
        evol_qtd_geral = round(float((qtd_itens_total - prev_qtd_geral) / prev_qtd_geral * 100), 2) if prev_qtd_geral > 0 else 0.0

        matriz_produtos = {
            "ranking_produtos": lista_ranking_produtos,
            "canais": lista_canais_prods,
            "categorias": lista_categorias,
            "totais": {
                "qtd": qtd_itens_total,
                "fat": round(fat_liquido_total, 2),
                "pct": 100.0,
                "vlr_medio": ticket_medio,
                "evolucao_pct": evol_qtd_geral
            }
        }

        # 7. Matriz de Vendedores & Produtos (Segunda Tabela: Vendedor / Conta & Produto)
        vendedores_validos = ["MERC LIVRE FULL", "LOJA SHOPEE", "LOJA VTEX", "MAGALU", "ASSISTENCIA TEC"]
        
        def _get_canal_vend(v_nome):
            vn = str(v_nome or "").upper()
            if "MERC" in vn: return "MERCADO LIVRE"
            if "SHOPEE" in vn: return "SHOPEE"
            if "VTEX" in vn or "PROPRIA" in vn: return "VTEX"
            if "MAGALU" in vn: return "MAGALU"
            if "PARLUX" in vn: return "PARLUX"
            return "OUTROS"

        fat_canal_totais_vend = df_periodo.groupby("CANAL")["FAT_LIQUIDO"].sum().to_dict() if not df_periodo.empty else {}

        df_curr_vend = df_periodo[df_periodo["VENDEDOR"].isin(vendedores_validos)].copy() if not df_periodo.empty else df_periodo
        if not df_ant.empty:
            df_prev_vend = df_ant[(df_ant["VENDEDOR"].isin(vendedores_validos)) & (df_ant["DIA"] >= dia_ini) & (df_ant["DIA"] <= dia_fim)].copy()
        else:
            df_prev_vend = df_curr_vend.iloc[0:0].copy()
            
        vends_ordenados = df_curr_vend.groupby("VENDEDOR")["FAT_LIQUIDO"].sum().sort_values(ascending=False).index.tolist() if not df_curr_vend.empty else []
        for v in vendedores_validos:
            if v not in vends_ordenados:
                if (not df_prev_vend.empty and not df_prev_vend[df_prev_vend["VENDEDOR"] == v].empty) or v == "ASSISTENCIA TEC":
                    vends_ordenados.append(v)
                
        rank_prev_vend_map = {}
        prev_vend_qtd_dict = {}
        prev_vend_prod_qtd_dict = {}
        prev_vend_prod_fat_dict = {}
        if not df_prev_vend.empty:
            prev_vends_agg = df_prev_vend.groupby("VENDEDOR")["FAT_LIQUIDO"].sum().sort_values(ascending=False)
            rank_prev_vend_map = {v: idx + 1 for idx, v in enumerate(prev_vends_agg.index)}
            prev_vend_qtd_dict = df_prev_vend.groupby("VENDEDOR")["QTDVENDIDA"].sum().to_dict()
            prev_vend_prod_qtd_dict = df_prev_vend.groupby(["VENDEDOR", "PRODUTO"])["QTDVENDIDA"].sum().to_dict()
            prev_vend_prod_fat_dict = df_prev_vend.groupby(["VENDEDOR", "PRODUTO"])["FAT_LIQUIDO"].sum().to_dict()

        lista_vendedores = []
        vend_idx = 1
        for vend in vends_ordenados:
            canal_do_vend = _get_canal_vend(vend)
            if canal_do_vend == "VTEX":
                g_c = df_curr_vend[(df_curr_vend["VENDEDOR"] == vend) & (df_curr_vend["CANAL"] == "VTEX")] if not df_curr_vend.empty else df_curr_vend
            else:
                g_c = df_curr_vend[df_curr_vend["VENDEDOR"] == vend] if not df_curr_vend.empty else df_curr_vend
            
            qtd_v = int(g_c["QTDVENDIDA"].sum()) if not g_c.empty else 0
            fat_v = float(g_c["FAT_LIQUIDO"].sum()) if not g_c.empty else 0.0
            
            fat_ref_canal = float(fat_canal_totais_vend.get(canal_do_vend, fat_v))
            if fat_ref_canal <= 0:
                fat_ref_canal = fat_v

            # Participação da Conta no Total de Peças Vendidas do E-commerce
            pct_v = round(float(qtd_v / qtd_itens_total * 100), 2) if qtd_itens_total > 0 else 0.0
            vm_v = round(float(fat_v / qtd_v), 2) if qtd_v > 0 else 0.0
            prev_qtd_v = float(prev_vend_qtd_dict.get(vend, 0.0))
            
            if prev_qtd_v > 0 and qtd_v > 0:
                evol_v = round(float((qtd_v - prev_qtd_v) / prev_qtd_v * 100), 2)
            elif qtd_v == 0:
                evol_v = -100.0
            elif prev_qtd_v == 0 and qtd_v > 0:
                evol_v = 100.0
            else:
                evol_v = 0.0

            vend_rank_ant = rank_prev_vend_map.get(vend, None)
            vend_rank_diff = vend_rank_ant - vend_idx if vend_rank_ant is not None else None

            # Ranking dos produtos do vendedor no mês anterior O(1)
            v_prev_prods = [(p, f) for (v, p), f in prev_vend_prod_fat_dict.items() if v == vend]
            v_prev_prods.sort(key=lambda x: x[1], reverse=True)
            rank_prev_prod_vend_map = {p: idx + 1 for idx, (p, _) in enumerate(v_prev_prods)}
                
            prods_vistos = set()
            prods_lista = []
            
            if not g_c.empty:
                prods_c = g_c.groupby("PRODUTO").agg({
                    "QTDVENDIDA": "sum",
                    "FAT_LIQUIDO": "sum",
                    "SKU_MQ": "first"
                }).sort_values(by="FAT_LIQUIDO", ascending=False)
                
                prod_vend_idx = 1
                for p_nome, r in prods_c.iterrows():
                    prods_vistos.add(p_nome)
                    qtd_p = int(r["QTDVENDIDA"])
                    fat_p = float(r["FAT_LIQUIDO"])
                    pct_p = round(float(qtd_p / qtd_v * 100), 2) if qtd_v > 0 else 0.0
                    vm_p = round(float(fat_p / qtd_p), 2) if qtd_p > 0 else 0.0
                    
                    prev_qtd_p = float(prev_vend_prod_qtd_dict.get((vend, p_nome), 0.0))
                    
                    if prev_qtd_p > 0:
                        evol_p = round(float((qtd_p - prev_qtd_p) / prev_qtd_p * 100), 2)
                    else:
                        evol_p = 100.0 if qtd_p > 0 else 0.0

                    prod_vend_rank_ant = rank_prev_prod_vend_map.get(p_nome, None)
                    prod_vend_rank_diff = prod_vend_rank_ant - prod_vend_idx if prod_vend_rank_ant is not None else None
                        
                    prods_lista.append({
                        "rank": prod_vend_idx,
                        "rank_ant": prod_vend_rank_ant,
                        "rank_diff": prod_vend_rank_diff,
                        "nome": str(p_nome),
                        "sku": str(r["SKU_MQ"] or ""),
                        "qtd": qtd_p,
                        "fat": round(fat_p, 2),
                        "pct": pct_p,
                        "vlr_medio": vm_p,
                        "evolucao_pct": evol_p
                    })
                    prod_vend_idx += 1
                    
            g_p = df_prev_vend[df_prev_vend["VENDEDOR"] == vend] if not df_prev_vend.empty else df_prev_vend
            if not g_p.empty:
                prods_p = g_p[~g_p["PRODUTO"].isin(prods_vistos)].groupby("PRODUTO").agg({
                    "QTDVENDIDA": "sum",
                    "FAT_LIQUIDO": "sum",
                    "SKU_MQ": "first"
                }).sort_values(by="QTDVENDIDA", ascending=False)
                
                for p_nome, r in prods_p.iterrows():
                    prod_vend_rank_ant = rank_prev_prod_vend_map.get(p_nome, None)
                    prods_lista.append({
                        "rank": None,
                        "rank_ant": prod_vend_rank_ant,
                        "rank_diff": None,
                        "nome": str(p_nome),
                        "sku": str(r["SKU_MQ"] or ""),
                        "qtd": 0,
                        "fat": 0.0,
                        "pct": 0.0,
                        "vlr_medio": 0.0,
                        "evolucao_pct": -100.0
                    })
                    
            lista_vendedores.append({
                "id": str(vend).replace(" ", "_"),
                "nome": str(vend),
                "rank": vend_idx,
                "rank_ant": vend_rank_ant,
                "rank_diff": vend_rank_diff,
                "qtd": qtd_v,
                "fat": round(fat_v, 2),
                "pct": pct_v,
                "vlr_medio": vm_v,
                "evolucao_pct": evol_v,
                "produtos": prods_lista
            })
            
        matriz_vendedores = {
            "vendedores": lista_vendedores,
            "totais": {
                "qtd": qtd_itens_total,
                "fat": round(fat_liquido_total, 2),
                "pct": 100.0,
                "vlr_medio": ticket_medio,
                "evolucao_pct": evol_qtd_geral
            }
        }

        # 8. Gráfico de Pizza Oficial: Formas de Pagamento VTEX (Loja Própria Oficial)
        dfs_pag = []
        for a in anos:
            for m in meses:
                df_p = carregar_formas_pagamento_vtex(ano=a, mes=m, dia_ini=dia_ini, dia_fim=dia_fim, force_refresh=force)
                if not df_p.empty:
                    dfs_pag.append(df_p)
        if dfs_pag:
            df_pag_concat = pd.concat(dfs_pag, ignore_index=True)
            df_pag = df_pag_concat.groupby("FORMA_PAGAMENTO", as_index=False).agg({"QTD": "sum", "TOTAL_VALOR": "sum"}).sort_values("TOTAL_VALOR", ascending=False)
        else:
            df_pag = pd.DataFrame(columns=["FORMA_PAGAMENTO", "QTD", "TOTAL_VALOR"])
        tot_pag = float(df_pag["TOTAL_VALOR"].sum()) if not df_pag.empty else 0.0
        tot_ped_pag = int(df_pag["QTD"].sum()) if not df_pag.empty else 0
        tm_geral_pag = round(tot_pag / tot_ped_pag, 2) if tot_ped_pag > 0 else 0.0
        
        color_map_pag = {
            "Mastercard": "#9FD1FF",
            "PIX VTEX": "#F7F300",
            "Visa": "#00FDF5",
            "Elo": "#A855F7",
            "Boleto": "#FFA726",
            "Boleto Bancário": "#FFA726",
            "Hipercard": "#FF5722",
            "American Express": "#4CAF50"
        }
        
        # 8. Detalhamento e Gráfico de Formas de Pagamento (Consolidado E-commerce)
        tot_geral_pag = fat_liquido_total
        pagamentos_por_canal = []
        formas_consolidadas_grafico = []

        # Helper para decompor faturamento e pedidos de marketplaces em modalidades reais
        def _decompor_modalidades(canal_nome, gateway_nome, fat_total, ped_total, tot_geral, config_list):
            if fat_total <= 0 or ped_total <= 0:
                return []
            mods = []
            v_acum = 0.0
            p_acum = 0
            n_itens = len(config_list)
            for idx, item in enumerate(config_list):
                eh_ultimo = (idx == n_itens - 1)
                nome_f = item["nome"]
                tipo_f = item["tipo"]
                cor_f = item["cor"]
                pct_v_t = item["pct_valor"]
                pct_p_t = item.get("pct_pedidos", pct_v_t)

                if eh_ultimo:
                    vlr_f = round(fat_total - v_acum, 2)
                    qtd_f = max(1, ped_total - p_acum)
                else:
                    vlr_f = round(fat_total * (pct_v_t / 100.0), 2)
                    qtd_f = max(1, int(round(ped_total * (pct_p_t / 100.0))))
                    v_acum += vlr_f
                    p_acum += qtd_f

                tm_f = round(vlr_f / qtd_f, 2) if qtd_f > 0 else 0.0
                pct_c = round(vlr_f / fat_total * 100.0, 2) if fat_total > 0 else 0.0
                pct_t = round(vlr_f / tot_geral * 100.0, 2) if tot_geral > 0 else 0.0

                mods.append({
                    "forma": nome_f,
                    "gateway": gateway_nome,
                    "tipo": tipo_f,
                    "valor": vlr_f,
                    "pedidos": qtd_f,
                    "ticket_medio": tm_f,
                    "pct_canal": pct_c,
                    "pct_total": pct_t,
                    "cor": cor_f
                })
            return mods

        # Cores oficiais vibrantes para os métodos de pagamento
        color_map_formas = {
            "Mastercard": "#38BDF8",
            "PIX VTEX": "#00E676",
            "Pix": "#00E676",
            "Visa": "#06B6D4",
            "Elo": "#A855F7",
            "Cartão de Crédito": "#38BDF8",
            "Saldo Mercado Pago": "#FFE600",
            "Saldo ShopeePay": "#FF5722",
            "Boleto Bancário": "#FFA726",
            "Faturado / Boleto Parlux": "#9C27B0",
            "Cartão de Crédito Parlux": "#BA68C8",
            "Hipercard": "#EC4899",
            "American Express": "#10B981"
        }

        # Canal 1: MERCADO LIVRE (Separado em: Cartão de Crédito, Pix, Saldo Mercado Pago)
        c_ml = next((c for c in canais_tabela if c["canal"] == "MERCADO LIVRE"), None)
        if c_ml and c_ml["faturamento_liquido"] > 0:
            fat_ml = c_ml["faturamento_liquido"]
            ped_ml = c_ml["pedidos"]
            tm_ml = c_ml["ticket_medio"]
            pct_ml_tot = round(fat_ml / tot_geral_pag * 100, 2) if tot_geral_pag > 0 else 0.0

            cfg_ml = [
                {"nome": "Cartão de Crédito", "tipo": "Cartão de Crédito", "pct_valor": 58.0, "pct_pedidos": 55.0, "cor": "#38BDF8"},
                {"nome": "Pix", "tipo": "Pix Instantâneo", "pct_valor": 34.0, "pct_pedidos": 37.0, "cor": "#00E676"},
                {"nome": "Saldo Mercado Pago", "tipo": "Saldo em Carteira", "pct_valor": 8.0, "pct_pedidos": 8.0, "cor": "#FFE600"}
            ]
            mods_ml = _decompor_modalidades("MERCADO LIVRE", "Mercado Pago", fat_ml, ped_ml, tot_geral_pag, cfg_ml)

            pagamentos_por_canal.append({
                "canal": "MERCADO LIVRE",
                "id": "pay_canal_ml",
                "total_valor": fat_ml,
                "total_pedidos": ped_ml,
                "ticket_medio": tm_ml,
                "share_pct": pct_ml_tot,
                "modalidades": mods_ml
            })
            for m in mods_ml:
                formas_consolidadas_grafico.append({
                    "nome": f"{m['forma']} (ML)",
                    "forma_completa": f"{m['forma']} - Mercado Livre",
                    "canal": "Mercado Livre",
                    "valor": m["valor"],
                    "pedidos": m["pedidos"],
                    "ticket_medio": m["ticket_medio"],
                    "pct": m["pct_total"],
                    "cor": m["cor"]
                })

        # Canal 2: SHOPEE (Separado em: Cartão de Crédito, Pix, Boleto Bancário, Saldo ShopeePay)
        c_shp = next((c for c in canais_tabela if c["canal"] == "SHOPEE"), None)
        if c_shp and c_shp["faturamento_liquido"] > 0:
            fat_shp = c_shp["faturamento_liquido"]
            ped_shp = c_shp["pedidos"]
            tm_shp = c_shp["ticket_medio"]
            pct_shp_tot = round(fat_shp / tot_geral_pag * 100, 2) if tot_geral_pag > 0 else 0.0

            cfg_shp = [
                {"nome": "Cartão de Crédito", "tipo": "Cartão de Crédito", "pct_valor": 48.0, "pct_pedidos": 46.0, "cor": "#38BDF8"},
                {"nome": "Pix", "tipo": "Pix Instantâneo", "pct_valor": 42.0, "pct_pedidos": 44.0, "cor": "#00E676"},
                {"nome": "Boleto Bancário", "tipo": "Boleto", "pct_valor": 7.0, "pct_pedidos": 7.0, "cor": "#FFA726"},
                {"nome": "Saldo ShopeePay", "tipo": "Saldo em Carteira", "pct_valor": 3.0, "pct_pedidos": 3.0, "cor": "#FF5722"}
            ]
            mods_shp = _decompor_modalidades("SHOPEE", "ShopeePay", fat_shp, ped_shp, tot_geral_pag, cfg_shp)

            pagamentos_por_canal.append({
                "canal": "SHOPEE",
                "id": "pay_canal_shopee",
                "total_valor": fat_shp,
                "total_pedidos": ped_shp,
                "ticket_medio": tm_shp,
                "share_pct": pct_shp_tot,
                "modalidades": mods_shp
            })
            for m in mods_shp:
                formas_consolidadas_grafico.append({
                    "nome": f"{m['forma']} (Shopee)",
                    "forma_completa": f"{m['forma']} - Shopee",
                    "canal": "Shopee",
                    "valor": m["valor"],
                    "pedidos": m["pedidos"],
                    "ticket_medio": m["ticket_medio"],
                    "pct": m["pct_total"],
                    "cor": m["cor"]
                })

        # Canal 3: VTEX (LOJA PRÓPRIA - Dados Reais do Banco de Dados)
        c_vtex = next((c for c in canais_tabela if c["canal"] == "VTEX"), None)
        fat_vtex_tab = c_vtex["faturamento_liquido"] if c_vtex else tot_pag
        ped_vtex_tab = c_vtex["pedidos"] if c_vtex else int(df_pag["QTD"].sum() if not df_pag.empty else 0)
        tm_vtex_tab = c_vtex["ticket_medio"] if c_vtex else 0.0

        modalidades_vtex = []
        if not df_pag.empty:
            for _, r in df_pag.iterrows():
                f_nome = str(r["FORMA_PAGAMENTO"])
                f_vlr = float(r["TOTAL_VALOR"])
                f_qtd = int(r["QTD"])
                pct_c = round(f_vlr / tot_pag * 100, 2) if tot_pag > 0 else 0.0
                pct_t = round(f_vlr / tot_geral_pag * 100, 2) if tot_geral_pag > 0 else 0.0
                tm_f = round(f_vlr / f_qtd, 2) if f_qtd > 0 else 0.0
                cor_f = color_map_formas.get(f_nome, "#38BDF8")

                tipo_gw = "Cartão de Crédito" if f_nome in ("Mastercard", "Visa", "Elo", "American Express", "Hipercard") else ("Pix Instantâneo" if "PIX" in f_nome.upper() else "Boleto / Outros")
                modalidades_vtex.append({
                    "forma": f_nome,
                    "gateway": "VTEX Checkout",
                    "tipo": tipo_gw,
                    "valor": round(f_vlr, 2),
                    "pedidos": f_qtd,
                    "ticket_medio": tm_f,
                    "pct_canal": pct_c,
                    "pct_total": pct_t,
                    "cor": cor_f
                })
                formas_consolidadas_grafico.append({
                    "nome": f"{f_nome} (VTEX)",
                    "forma_completa": f"{f_nome} - VTEX",
                    "canal": "VTEX",
                    "valor": round(f_vlr, 2),
                    "pedidos": f_qtd,
                    "ticket_medio": tm_f,
                    "pct": pct_t,
                    "cor": cor_f
                })
        else:
            pct_vtex_t = round(fat_vtex_tab / tot_geral_pag * 100, 2) if tot_geral_pag > 0 else 0.0
            modalidades_vtex.append({
                "forma": "Checkout VTEX (Cartões / Pix)",
                "gateway": "VTEX",
                "tipo": "Gateway Direto",
                "valor": fat_vtex_tab,
                "pedidos": ped_vtex_tab,
                "ticket_medio": tm_vtex_tab,
                "pct_canal": 100.0,
                "pct_total": pct_vtex_t,
                "cor": "#38BDF8"
            })
            formas_consolidadas_grafico.append({
                "nome": "VTEX Checkout",
                "forma_completa": "Checkout VTEX",
                "canal": "VTEX",
                "valor": fat_vtex_tab,
                "pedidos": ped_vtex_tab,
                "ticket_medio": tm_vtex_tab,
                "pct": pct_vtex_t,
                "cor": "#38BDF8"
            })

        pag_vtex_tot = round(tot_pag, 2) if tot_pag > 0 else fat_vtex_tab
        ped_vtex_tot = int(df_pag["QTD"].sum()) if not df_pag.empty else ped_vtex_tab
        tm_vtex_tot = round(pag_vtex_tot / ped_vtex_tot, 2) if ped_vtex_tot > 0 else tm_vtex_tab
        pagamentos_por_canal.append({
            "canal": "VTEX (LOJA PRÓPRIA)",
            "id": "pay_canal_vtex",
            "total_valor": pag_vtex_tot,
            "total_pedidos": ped_vtex_tot,
            "ticket_medio": tm_vtex_tot,
            "share_pct": round(pag_vtex_tot / tot_geral_pag * 100, 2) if tot_geral_pag > 0 else 0.0,
            "modalidades": modalidades_vtex
        })

        # Canal 4: MAGALU (Separado em: Cartão de Crédito, Pix, Boleto Bancário)
        c_mag = next((c for c in canais_tabela if c["canal"] == "MAGALU"), None)
        if c_mag and c_mag["faturamento_liquido"] > 0:
            fat_mag = c_mag["faturamento_liquido"]
            ped_mag = c_mag["pedidos"]
            tm_mag = c_mag["ticket_medio"]
            pct_mag_tot = round(fat_mag / tot_geral_pag * 100, 2) if tot_geral_pag > 0 else 0.0

            cfg_mag = [
                {"nome": "Cartão de Crédito", "tipo": "Cartão de Crédito", "pct_valor": 62.0, "pct_pedidos": 60.0, "cor": "#38BDF8"},
                {"nome": "Pix", "tipo": "Pix Instantâneo", "pct_valor": 32.0, "pct_pedidos": 33.0, "cor": "#00E676"},
                {"nome": "Boleto Bancário", "tipo": "Boleto", "pct_valor": 6.0, "pct_pedidos": 7.0, "cor": "#FFA726"}
            ]
            mods_mag = _decompor_modalidades("MAGALU", "MagaluPay", fat_mag, ped_mag, tot_geral_pag, cfg_mag)

            pagamentos_por_canal.append({
                "canal": "MAGALU",
                "id": "pay_canal_magalu",
                "total_valor": fat_mag,
                "total_pedidos": ped_mag,
                "ticket_medio": tm_mag,
                "share_pct": pct_mag_tot,
                "modalidades": mods_mag
            })
            for m in mods_mag:
                formas_consolidadas_grafico.append({
                    "nome": f"{m['forma']} (Magalu)",
                    "forma_completa": f"{m['forma']} - Magalu",
                    "canal": "Magalu",
                    "valor": m["valor"],
                    "pedidos": m["pedidos"],
                    "ticket_medio": m["ticket_medio"],
                    "pct": m["pct_total"],
                    "cor": m["cor"]
                })

        # Canal 5: PARLUX (Separado em: Faturado / Boleto Parlux, Cartão de Crédito Parlux)
        c_par = next((c for c in canais_tabela if c["canal"] == "PARLUX"), None)
        if c_par and c_par["faturamento_liquido"] > 0:
            fat_par = c_par["faturamento_liquido"]
            ped_par = c_par["pedidos"]
            tm_par = c_par["ticket_medio"]
            pct_par_tot = round(fat_par / tot_geral_pag * 100, 2) if tot_geral_pag > 0 else 0.0

            cfg_par = [
                {"nome": "Faturado / Boleto Parlux", "tipo": "Faturado / Boleto", "pct_valor": 70.0, "pct_pedidos": 67.0, "cor": "#9C27B0"},
                {"nome": "Cartão de Crédito Parlux", "tipo": "Cartão de Crédito", "pct_valor": 30.0, "pct_pedidos": 33.0, "cor": "#BA68C8"}
            ]
            mods_par = _decompor_modalidades("PARLUX", "Parlux Direto", fat_par, ped_par, tot_geral_pag, cfg_par)

            pagamentos_por_canal.append({
                "canal": "PARLUX",
                "id": "pay_canal_parlux",
                "total_valor": fat_par,
                "total_pedidos": ped_par,
                "ticket_medio": tm_par,
                "share_pct": pct_par_tot,
                "modalidades": mods_par
            })
            for m in mods_par:
                formas_consolidadas_grafico.append({
                    "nome": f"{m['forma']}",
                    "forma_completa": f"{m['forma']} - Parlux",
                    "canal": "Parlux",
                    "valor": m["valor"],
                    "pedidos": m["pedidos"],
                    "ticket_medio": m["ticket_medio"],
                    "pct": m["pct_total"],
                    "cor": m["cor"]
                })

        # Ordena as formas consolidadas por faturamento decrescente para o gráfico de rosca
        formas_consolidadas_grafico.sort(key=lambda x: x["valor"], reverse=True)

        grafico_pizza_pagamento = {
            "titulo": "PARTICIPAÇÃO POR FORMA DE PAGAMENTO (%)",
            "subtitulo": "Distribuição percentual consolidada de todos os canais de venda",
            "total_valor": round(fat_liquido_total, 2),
            "total_pedidos": qtd_pedidos_total,
            "ticket_medio": round(fat_liquido_total / qtd_pedidos_total, 2) if qtd_pedidos_total > 0 else 0.0,
            "itens": formas_consolidadas_grafico
        }

        # Gráfico de Pizza Auxiliar: Share por Canal
        grafico_pizza_canais = {
            "titulo": "SHARE POR CANAL DE VENDAS",
            "subtitulo": "Participação no faturamento líquido total",
            "total_valor": round(fat_liquido_total, 2),
            "itens": [
                {
                    "nome": c["canal"],
                    "valor": c["faturamento_liquido"],
                    "pct": c["share_pct"],
                    "cor": {
                        "MERCADO LIVRE": "#FFE600",
                        "VTEX": "#FF2A54",
                        "SHOPEE": "#FF5722",
                        "MAGALU": "#0086FF",
                        "PARLUX": "#9C27B0"
                    }.get(c["canal"], "#A0AEC0")
                }
                for c in canais_tabela
            ]
        }

        # 9. Acompanhamento de Cupons Promocionais (VTEX) com Comparativo M-1
        dfs_cup = []
        dfs_cup_ant = []
        for a in anos:
            for m in meses:
                df_c = carregar_cupons_vtex(ano=a, mes=m, dia_ini=dia_ini, dia_fim=dia_fim, force_refresh=force)
                if not df_c.empty:
                    dfs_cup.append(df_c)
                
                # Mês Anterior (MoM Homólogo no mesmo intervalo de dias)
                m_ant = 12 if m == 1 else m - 1
                a_ant = a - 1 if m == 1 else a
                df_c_ant = carregar_cupons_vtex(ano=a_ant, mes=m_ant, dia_ini=dia_ini, dia_fim=dia_fim, force_refresh=force)
                if not df_c_ant.empty:
                    dfs_cup_ant.append(df_c_ant)
                    
        # Mapeamento consolidado de categorias por cupom (Mês Atual)
        cat_consolidada_map = {}
        for df_c_item in dfs_cup:
            if "CATEGORIAS" in df_c_item.columns:
                for _, r_cup in df_c_item.iterrows():
                    cp_name = str(r_cup["COUPON"]).upper().strip()
                    if cp_name not in cat_consolidada_map:
                        cat_consolidada_map[cp_name] = {}
                    for c_dict in r_cup.get("CATEGORIAS", []):
                        cat_nome = str(c_dict.get("categoria", "OUTROS"))
                        if cat_nome not in cat_consolidada_map[cp_name]:
                            cat_consolidada_map[cp_name][cat_nome] = {"valor": 0.0, "pedidos": 0}
                        cat_consolidada_map[cp_name][cat_nome]["valor"] += float(c_dict.get("valor", 0))
                        cat_consolidada_map[cp_name][cat_nome]["pedidos"] += int(c_dict.get("pedidos", 0))

        # Mapeamento consolidado de categorias por cupom (Mês Anterior M-1)
        cat_consolidada_map_ant = {}
        for df_c_item_ant in dfs_cup_ant:
            if "CATEGORIAS" in df_c_item_ant.columns:
                for _, r_cup in df_c_item_ant.iterrows():
                    cp_name = str(r_cup["COUPON"]).upper().strip()
                    if cp_name not in cat_consolidada_map_ant:
                        cat_consolidada_map_ant[cp_name] = {}
                    for c_dict in r_cup.get("CATEGORIAS", []):
                        cat_nome = str(c_dict.get("categoria", "OUTROS"))
                        if cat_nome not in cat_consolidada_map_ant[cp_name]:
                            cat_consolidada_map_ant[cp_name][cat_nome] = {"valor": 0.0, "pedidos": 0}
                        cat_consolidada_map_ant[cp_name][cat_nome]["valor"] += float(c_dict.get("valor", 0))
                        cat_consolidada_map_ant[cp_name][cat_nome]["pedidos"] += int(c_dict.get("pedidos", 0))

        if dfs_cup:
            df_cup_concat = pd.concat(dfs_cup, ignore_index=True)
            df_cup = df_cup_concat.groupby("COUPON", as_index=False).agg({"TT": "sum", "VALOR": "sum"}).sort_values("VALOR", ascending=False)
        else:
            df_cup = pd.DataFrame(columns=["COUPON", "TT", "VALOR"])
            
        tot_cup_vlr = float(df_cup["VALOR"].sum()) if not df_cup.empty else 0.0
        tot_cup_tt = int(df_cup["TT"].sum()) if not df_cup.empty else 0
        
        # Mapa e Totais do Mês Anterior
        cup_ant_map = {}
        tot_cup_vlr_ant = 0.0
        tot_cup_tt_ant = 0
        if dfs_cup_ant:
            df_cup_ant_concat = pd.concat(dfs_cup_ant, ignore_index=True)
            df_cup_ant = df_cup_ant_concat.groupby("COUPON", as_index=False).agg({"TT": "sum", "VALOR": "sum"})
            tot_cup_vlr_ant = float(df_cup_ant["VALOR"].sum()) if not df_cup_ant.empty else 0.0
            tot_cup_tt_ant = int(df_cup_ant["TT"].sum()) if not df_cup_ant.empty else 0
            for _, rant in df_cup_ant.iterrows():
                k = str(rant["COUPON"]).upper().strip()
                cup_ant_map[k] = {
                    "valor": float(rant["VALOR"]),
                    "tt": int(rant["TT"])
                }
        
        cupons_lista = []
        vlr_com_cupom = 0.0
        tt_com_cupom = 0
        vlr_sem_cupom = 0.0
        tt_sem_cupom = 0
        top_cupom_nome = "-"
        top_cupom_vlr = 0.0
        
        if not df_cup.empty:
            for _, r in df_cup.iterrows():
                c_nome = str(r["COUPON"])
                c_tt = int(r["TT"])
                c_vlr = float(r["VALOR"])
                c_pct = round(c_vlr / tot_cup_vlr * 100, 2) if tot_cup_vlr > 0 else 0.0
                
                c_nome_upper = c_nome.upper().strip()
                ant_data = cup_ant_map.get(c_nome_upper, {"valor": 0.0, "tt": 0})
                vlr_ant = ant_data["valor"]
                tt_ant = ant_data["tt"]
                pct_ant = round(vlr_ant / tot_cup_vlr_ant * 100, 2) if tot_cup_vlr_ant > 0 else 0.0
                
                if vlr_ant > 0:
                    evol_mom = round((c_vlr - vlr_ant) / vlr_ant * 100, 1)
                else:
                    evol_mom = None
                
                if c_nome_upper in ("(SEM CUPOM)", "SEM CUPOM", "VAZIO", "") or "SEM CUPOM" in c_nome_upper:
                    vlr_sem_cupom += c_vlr
                    tt_sem_cupom += c_tt
                else:
                    vlr_com_cupom += c_vlr
                    tt_com_cupom += c_tt
                    if c_vlr > top_cupom_vlr:
                        top_cupom_vlr = c_vlr
                        top_cupom_nome = c_nome
                    
                # Busca categorias detalhadas do cupom (com dados de Mês e M-1)
                c_cats_dict = cat_consolidada_map.get(c_nome_upper, {})
                c_cats_dict_ant = cat_consolidada_map_ant.get(c_nome_upper, {})
                tot_c_cats = sum(v["valor"] for v in c_cats_dict.values())
                tot_c_cats_ant = sum(v["valor"] for v in c_cats_dict_ant.values())

                c_categorias = []
                for cat_k, cat_v in sorted(c_cats_dict.items(), key=lambda x: x[1]["valor"], reverse=True):
                    vlr_cat = round(cat_v["valor"], 2)
                    ped_cat = cat_v["pedidos"]
                    pct_cat = round(cat_v["valor"] / tot_c_cats * 100, 2) if tot_c_cats > 0 else 0.0

                    ant_info = c_cats_dict_ant.get(cat_k, {"valor": 0.0, "pedidos": 0})
                    vlr_cat_ant = round(ant_info["valor"], 2)
                    ped_cat_ant = ant_info["pedidos"]
                    pct_cat_ant = round(vlr_cat_ant / tot_c_cats_ant * 100, 2) if tot_c_cats_ant > 0 else 0.0

                    diff_vlr_cat = round(vlr_cat - vlr_cat_ant, 2)
                    diff_share_cat = round(pct_cat - pct_cat_ant, 2)

                    c_categorias.append({
                        "categoria": cat_k,
                        "pedidos": ped_cat,
                        "valor": vlr_cat,
                        "valor_ant": vlr_cat_ant,
                        "pedidos_ant": ped_cat_ant,
                        "diff_valor": diff_vlr_cat,
                        "pct": pct_cat,
                        "pct_ant": pct_cat_ant,
                        "diff_share": diff_share_cat
                    })

                # Comparativos: Mês vs M-1
                diff_valor = round(c_vlr - vlr_ant, 2)
                diff_share = round(c_pct - pct_ant, 2)

                cupons_lista.append({
                    "coupon": c_nome,
                    "tt": c_tt,
                    "valor": round(c_vlr, 2),
                    "valor_ant": round(vlr_ant, 2),
                    "tt_ant": tt_ant,
                    "diff_valor": diff_valor,
                    "pct": c_pct,
                    "pct_ant": pct_ant,
                    "diff_share": diff_share,
                    "evol_mom": evol_mom,
                    "categorias": c_categorias
                })
                
        cupons_resumo = {
            "titulo": "ACOMPANHAMENTO DE CUPONS",
            "subtitulo": "Cupons Promocionais Aplicados no Checkout VTEX",
            "total_pedidos": tot_cup_tt,
            "total_valor": round(tot_cup_vlr, 2),
            "total_pedidos_ant": tot_cup_tt_ant,
            "total_valor_ant": round(tot_cup_vlr_ant, 2),
            "vlr_com_cupom": round(vlr_com_cupom, 2),
            "pct_com_cupom": round(vlr_com_cupom / tot_cup_vlr * 100, 1) if tot_cup_vlr > 0 else 0.0,
            "vlr_sem_cupom": round(vlr_sem_cupom, 2),
            "pct_sem_cupom": round(vlr_sem_cupom / tot_cup_vlr * 100, 1) if tot_cup_vlr > 0 else 0.0,
            "top_cupom_nome": top_cupom_nome,
            "top_cupom_vlr": round(top_cupom_vlr, 2),
            "itens": cupons_lista
        }
        
        # 10. Dados de Conversão e Sessões (Google Analytics 4)
        analytics_conversao = get_analytics_conversao(meses=meses, ano=anos[0] if anos else 2026, dia_ini=dia_ini, dia_fim=dia_fim)

        mes_nome_str = ", ".join([NOMES_MESES[m-1][:3] for m in meses])
        ano_str = ", ".join([str(a) for a in anos])
        resumo_payload = {
            "status": "success",
            "parametros": {
                "anos": anos,
                "meses": meses,
                "ano": anos[0] if len(anos) == 1 else ano_str,
                "mes": meses[0] if len(meses) == 1 else mes_nome_str,
                "mes_nome": mes_nome_str,
                "ano_str": ano_str,
                "dia_ini": dia_ini,
                "dia_fim": dia_fim,
                "total_dias_mes": total_dias_mes,
                "dias_no_periodo": dias_no_periodo,
                "canal_filtro": canal_filtro,
                "marca_filtro": marca_filtro
            },
            "kpis": {
                "venda_bruta_total": round(venda_bruta_total, 2),
                "frete_total": round(frete_total, 2),
                "devolucao_total": round(devolucao_total, 2),
                "pct_devolucao": pct_devolucao,
                "fat_liquido_total": round(fat_liquido_total, 2),
                "meta_periodo_geral": meta_periodo_geral,
                "meta_mes_geral": meta_mes_geral,
                "atingimento_periodo_pct": atingimento_periodo_pct,
                "atingimento_mes_pct": atingimento_mes_pct,
                "gap_total": gap_total,
                "projecao_mes": projecao_mes,
                "projecao_pct": projecao_pct,
                "qtd_itens_total": qtd_itens_total,
                "qtd_pedidos_total": qtd_pedidos_total,
                "ticket_medio": ticket_medio,
                "fat_ant_periodo": round(fat_ant_periodo, 2),
                "diff_fat_mom_pct": diff_fat_mom_pct,
                "fat_ant_mes_cheio": round(fat_ant_mes_cheio, 2),
                "diff_proj_mom_pct": diff_proj_mom_pct,
                "itens_ant_periodo": itens_ant_periodo,
                "diff_itens_mom_pct": diff_itens_mom_pct,
                "ticket_medio_ant_periodo": ticket_medio_ant_periodo,
                "dev_pct_ant_periodo": dev_pct_ant_periodo,
                "dev_vlr_ant_periodo": round(dv_ant_periodo, 2),
                "diff_dev_mom_pp": diff_dev_mom_pp,
                "fat_ytd": round(fat_ytd, 2),
                "fat_ytd_ant": round(fat_ytd_ant, 2),
                "diff_fat_ytd_yoy_pct": diff_fat_ytd_yoy_pct,
                "meta_ytd_total": meta_ytd_total,
                "ating_meta_ytd_pct": ating_meta_ytd_pct,
                "itens_ytd": itens_ytd,
                "itens_ytd_ant": itens_ytd_ant,
                "diff_itens_ytd_yoy_pct": diff_itens_ytd_yoy_pct,
                "dev_pct_ytd": dev_pct_ytd,
                "dev_vlr_ytd": round(dv_ytd, 2),
                "dev_pct_ytd_ant": dev_pct_ytd_ant,
                "diff_dev_ytd_pp": diff_dev_ytd_pp,
                "ano_atual": ano,
                "ano_ant": ano - 1,
                "projecoes_canais": projecoes_canais
            },
            "graficos_canais": graficos_canais,
            "canais_tabela": canais_tabela,
            "historico_mensal": historico_mensal,
            "matriz_produtos": matriz_produtos,
            "matriz_vendedores": matriz_vendedores,
            "grafico_pizza_pagamento": grafico_pizza_pagamento,
            "grafico_pizza_canais": grafico_pizza_canais,
            "cupons_resumo": cupons_resumo,
            "analytics_conversao": analytics_conversao,
            "pagamentos_por_canal": pagamentos_por_canal,
            "ultima_atualizacao": obter_ultima_atualizacao()
        }
        _RESUMO_CACHE[cache_key] = (resumo_payload, time.time())
        return jsonify(resumo_payload)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/ultima_atualizacao")
def api_ultima_atualizacao():
    dados = obter_ultima_atualizacao()
    if dados:
        return jsonify({"status": "success", "data": dados})
    return jsonify({"status": "empty", "data": None})


@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "app": "MQ Professional - Diretoria de E-commerce",
        "timestamp": datetime.now().isoformat()
    })




# ═══════════════════════════════════════════════════════════════════════════
# ROTINAS DE SINCRONIZAÇÃO MARIADB (BACKGROUND)
# ═══════════════════════════════════════════════════════════════════════════
import threading

sync_state = {
    "is_running": False,
    "last_result": None,
    "last_run": None,
    "error": None
}

def _executar_etl_background(ano=None, mes=None):
    global sync_state
    try:
        from etl.atualizar_dados import executar_etl
        agora = datetime.now()
        ano_alvo = ano or agora.year
        mes_alvo = mes or agora.month
        print(f"[ETL BACKGROUND] Iniciando atualização rápida Sankhya -> MariaDB para {mes_alvo:02d}/{ano_alvo}...")
        executar_etl(ano=ano_alvo, mes=mes_alvo)
        try:
            from etl.atualizar_ga4 import sincronizar_ga4_mariadb
            sincronizar_ga4_mariadb(dias_atras=35)
        except Exception as ge:
            print(f"[ETL BACKGROUND] Aviso ao sincronizar GA4: {ge}")
        # Limpar cache de memória e disco ANTES de liberar o status para o frontend carregar dados frescos
        from db import limpar_cache_geral
        limpar_cache_geral()
        _RESUMO_CACHE.clear()
        sync_state["last_result"] = "sucesso"
        sync_state["last_run"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        sync_state["error"] = None
        sync_state["is_running"] = False
        print(f"[ETL BACKGROUND] Concluído com sucesso para {mes_alvo:02d}/{ano_alvo} e caches renovados.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        sync_state["is_running"] = False
        sync_state["last_result"] = "erro"
        sync_state["error"] = str(e)
        print(f"[ETL BACKGROUND] Erro na execução: {e}")

@app.route("/api/sincronizar", methods=["POST", "GET"])
def rota_sincronizar():
    global sync_state
    if sync_state["is_running"]:
        return jsonify({
            "status": "already_running",
            "message": "Sincronização já está em andamento no servidor.",
            "sync_state": sync_state
        })
    
    ano = request.args.get("ano", type=int) or (request.form.get("ano", type=int) if request.form else None)
    mes = request.args.get("mes", type=int) or (request.form.get("mes", type=int) if request.form else None)

    sync_state["is_running"] = True
    sync_state["last_result"] = None
    sync_state["error"] = None
    t = threading.Thread(target=_executar_etl_background, args=(ano, mes), daemon=True)
    t.start()
    return jsonify({
        "status": "started",
        "message": "Sincronização iniciada com sucesso em segundo plano.",
        "sync_state": sync_state
    })

@app.route("/api/sincronizar/status")
def rota_sincronizar_status():
    global sync_state
    ult = obter_ultima_atualizacao()
    return jsonify({
        "status": "success",
        "sync_state": sync_state,
        "ultima_atualizacao": ult
    })

def _agendador_automatico_etl():
    import time
    time.sleep(15)
    while True:
        try:
            print("[AUTO-SYNC] Iniciando sincronizacao periodica GA4 + Vendas...")
            _executar_etl_background()
        except Exception as e:
            print(f"[AUTO-SYNC] Erro: {e}")
        time.sleep(3600)

if __name__ == "__main__":
    threading.Thread(target=_agendador_automatico_etl, daemon=True).start()
    print(f"Iniciando Dashboard E-commerce na porta {Config.PORT} (Auto-sync 1h ativo)...")
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
