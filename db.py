# -*- coding: utf-8 -*-
"""
Módulo de Conexão com Oracle Sankhya e Extração de Vendas do E-commerce.
"""

import os
import time
import calendar
import pickle
from datetime import datetime
import pandas as pd
import oracledb
from config import Config

# Certifica que o diretório de cache existe
os.makedirs(Config.CACHE_DIR, exist_ok=True)

# Cache em memória
_MEMORY_CACHE = {}


def get_oracle_connection():
    """Cria conexão no modo thin (nativo, sem necessidade do Oracle Instant Client)."""
    conn = oracledb.connect(
        user=Config.ORACLE_USER,
        password=Config.ORACLE_PASSWORD,
        dsn=Config.ORACLE_DSN
    )
    with conn.cursor() as cur:
        cur.execute("ALTER SESSION SET CURRENT_SCHEMA = SANKHYA")
    return conn


def classificar_canal(apelido: str, marca: str) -> str:
    """
    Classifica cada item vendido nos 5 canais oficiais de e-commerce da MQ:
    1. PARLUX (se a marca do item for PARLUX)
    2. MERCADO LIVRE (vendedor MERC LIVRE FULL ou MERCADO LIVRE)
    3. VTEX (vendedor LOJA VTEX ou LOJA PROPRIA)
    4. SHOPEE (vendedor LOJA SHOPEE)
    5. MAGALU (vendedor MAGALU)
    """
    apelido_str = str(apelido or '').upper()
    marca_str = str(marca or '').upper()
    
    if 'PARLUX' in marca_str:
        return 'PARLUX'
    if 'MERC' in apelido_str:
        return 'MERCADO LIVRE'
    if 'VTEX' in apelido_str or 'PROPRIA' in apelido_str:
        return 'VTEX'
    if 'SHOPEE' in apelido_str:
        return 'SHOPEE'
    if 'MAGALU' in apelido_str:
        return 'MAGALU'
    return 'OUTROS'


def carregar_vendas_ecommerce(ano: int, mes: int = None, force_refresh: bool = False) -> pd.DataFrame:
    """
    Carrega as vendas de e-commerce do Oracle Sankhya com cache inteligente em disco e memória.
    Se mes for None, carrega o ano todo (montado dinamicamente a partir dos meses cacheados ou cache anual).
    """
    cache_key = f"ecom_{ano}_{mes if mes is not None else 'ano'}"
    now_ts = time.time()
    now = datetime.now()
    
    # Meses anteriores ou anos passados nunca mudam: TTL longo (30 dias)
    is_fechado = (ano < now.year) or (mes is not None and ano == now.year and mes < now.month)
    ttl = 86400 * 30 if is_fechado else (Config.CACHE_TTL_REALTIME if mes == now.month else Config.CACHE_TTL_HISTORIC)
    disk_file = os.path.join(Config.CACHE_DIR, f"{cache_key}.pkl")
    
    # 1. Verifica cache em memória
    if not force_refresh and cache_key in _MEMORY_CACHE:
        df, ts = _MEMORY_CACHE[cache_key]
        if now_ts - ts < ttl:
            return df.copy()
            
    # 2. Verifica cache em disco do arquivo exato
    if not force_refresh and os.path.exists(disk_file):
        file_age = now_ts - os.path.getmtime(disk_file)
        if file_age < ttl:
            try:
                df = pd.read_pickle(disk_file)
                _MEMORY_CACHE[cache_key] = (df.copy(), now_ts)
                return df.copy()
            except Exception as e:
                print(f"[CACHE DISCO] Erro ao ler cache {disk_file}: {e}")

    # 3. FAST PATH MÊS: Se pediu um mês específico e temos o arquivo do ano em disco ou memória,
    # fatia o mês instantaneamente sem tocar no banco de dados!
    if mes is not None and not force_refresh:
        ano_key = f"ecom_{ano}_ano"
        df_ano_ref = None
        if ano_key in _MEMORY_CACHE:
            df_ano_ref, _ = _MEMORY_CACHE[ano_key]
        else:
            ano_disk = os.path.join(Config.CACHE_DIR, f"{ano_key}.pkl")
            if os.path.exists(ano_disk):
                try:
                    df_ano_ref = pd.read_pickle(ano_disk)
                    _MEMORY_CACHE[ano_key] = (df_ano_ref.copy(), now_ts)
                except Exception:
                    pass
        if df_ano_ref is not None and not df_ano_ref.empty and "MES" in df_ano_ref.columns:
            df_m = df_ano_ref[df_ano_ref["MES"] == mes].copy()
            _MEMORY_CACHE[cache_key] = (df_m.copy(), now_ts)
            try:
                df_m.to_pickle(disk_file)
            except Exception:
                pass
            return df_m.copy()

    # 4. FAST PATH ANO: Se pediu o ano todo (mes=None), tenta montar concatenando os meses existentes em cache!
    if mes is None and not force_refresh:
        meses_dfs = []
        max_m = 12 if ano < now.year else now.month
        todos_presentes = True
        for m_i in range(1, max_m + 1):
            f_m = os.path.join(Config.CACHE_DIR, f"ecom_{ano}_{m_i}.pkl")
            if os.path.exists(f_m):
                try:
                    meses_dfs.append(pd.read_pickle(f_m))
                except Exception:
                    todos_presentes = False
                    break
            else:
                todos_presentes = False
                break
        if todos_presentes and meses_dfs:
            df_concatenado = pd.concat(meses_dfs, ignore_index=True)
            _MEMORY_CACHE[cache_key] = (df_concatenado.copy(), now_ts)
            try:
                df_concatenado.to_pickle(disk_file)
            except Exception:
                pass
            return df_concatenado.copy()

    # Determina filtros de data para query SQL
    if mes is not None:
        _, num_days = calendar.monthrange(ano, mes)
        dt_ini = f"01/{mes:02d}/{ano}"
        dt_fim = f"{num_days}/{mes:02d}/{ano}"
    else:
        dt_ini = f"01/01/{ano}"
        dt_fim = f"31/12/{ano}"
        
    sql = f"""
    SELECT 
        CAB.CODEMP,
        (SELECT E.NOMEFANTASIA FROM TSIEMP E WHERE E.CODEMP = CAB.CODEMP) AS EMPRESA,
        CAB.NUNOTA,
        CAB.DTNEG,
        CAB.DTENTSAI,
        TO_NUMBER(TO_CHAR(CAB.DTENTSAI, 'DD')) AS DIA,
        EXTRACT(MONTH FROM CAB.DTENTSAI) AS MES,
        EXTRACT(YEAR FROM CAB.DTENTSAI) AS ANO,
        (SELECT uf FROM tsiufs WHERE coduf = (SELECT uf FROM tsicid WHERE codcid=(SELECT codcid FROM tgfpar WHERE codparc=cab.codparc))) AS UF,
        (SELECT nomecid FROM tsicid WHERE codcid=(SELECT codcid FROM tgfpar WHERE codparc=cab.codparc)) AS CIDADE,
        VEN.APELIDO AS VENDEDOR,
        VEN.CODVEND,
        PAR.CODPARC,
        PAR.NOMEPARC,
        TOP.DESCROPER,
        TOP.BONIFICACAO,
        CAB.TIPMOV,
        (SELECT G.DESCRGRUPOPROD FROM TGFGRU G WHERE G.CODGRUPOPROD = CASE WHEN LENGTH(TO_CHAR(PRO.codgrupoprod))=7 THEN RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,1),7,'0') ELSE RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,2),8,'0') END) AS GRUPO_GERAL,
        (SELECT G.DESCRGRUPOPROD FROM TGFGRU G WHERE G.CODGRUPOPROD = CASE WHEN LENGTH(TO_CHAR(PRO.codgrupoprod))=7 THEN RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,4),7,'0') ELSE RPAD(SUBSTR(TO_CHAR(PRO.codgrupoprod),1,5),8,'0') END) AS GRUPO_SINTETICO,
        GRU.DESCRGRUPOPROD AS GRUPO_ANALITICO,
        UPPER(PRO.MARCA) AS MARCA,
        ITE.CODPROD,
        PRO.DESCRPROD AS PRODUTO,
        PRO.REFERENCIA AS SKU_MQ,
        ((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',0,'V',1) AS VALORVENDA,
        CASE WHEN CAB.CODEMP <> 501 AND NVL (TOP.BONIFICACAO, 'N') = 'N' THEN (ITE.QTDNEG) END * DECODE(CAB.TIPMOV,'D',0,'V',1) AS QTDVENDIDA,
        CASE WHEN CAB.CODEMP <> 501 AND NVL (TOP.BONIFICACAO, 'N') = 'N' THEN (F_OBTEM_CUSTO_MQ (CAB.CODEMP, ITE.CODPROD, CAB.DTNEG, CAB.DTNEG) * ITE.QTDNEG) END * DECODE(CAB.TIPMOV,'D',0,'V',1) * (CASE WHEN CAB.CODTIPOPER=11000 THEN 0 ELSE 1 END) AS CUSTOGER,
        F_OBTEM_FRETEITE(CAB.NUNOTA,ITE.SEQUENCIA) AS FRETE,
        ((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',1,'V',0) AS VALORDEVOLUCAO,
        CAB.AD_PEDIDO_ECOMMERCE AS RASTREIO_PEDIDO
    FROM TGFCAB CAB
         JOIN TGFITE ITE ON CAB.NUNOTA = ITE.NUNOTA
         JOIN TGFTOP TOP ON CAB.CODTIPOPER = TOP.CODTIPOPER AND CAB.DHTIPOPER = TOP.DHALTER
         JOIN TGFPAR PAR ON CAB.CODPARC = PAR.CODPARC
         JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD
         LEFT JOIN TGFGRU GRU ON PRO.CODGRUPOPROD = GRU.CODGRUPOPROD
         JOIN VGFCAB VCA ON CAB.NUNOTA = VCA.NUNOTA
         LEFT JOIN TGFVEN VEN ON CAB.CODVEND = VEN.CODVEND
    WHERE CAB.TIPMOV IN ('V', 'D')
      AND CAB.STATUSNOTA = 'L' 
      AND (TOP.GOLSINAL = -1 OR TOP.BONIFICACAO='S')
      AND (NOT EXISTS(SELECT 1 FROM TGFVAR VAR WHERE VAR.NUNOTA = ITE.NUNOTA AND VAR.NUNOTAORIG = VAR.NUNOTA AND VAR.SEQUENCIAORIG = ITE.SEQUENCIA))
      AND (TOP.ATUALFINTERC <> 'N' OR TOP.ATUALESTTERC = 'N' OR ITE.TERCEIROS <> 'S')
      AND ITE.SEQUENCIA > 0    
      AND TOP.GOLDEV IN (1,-1)
      AND (VEN.CODGER = 7193 OR VEN.CODVEND = 7193 OR CAB.AD_PEDIDO_ECOMMERCE IS NOT NULL)
      AND CAB.DTENTSAI >= TO_DATE('{dt_ini}','DD/MM/YYYY')
      AND CAB.DTENTSAI <= TO_DATE('{dt_fim}','DD/MM/YYYY')
    """
    
    conn = get_oracle_connection()
    try:
        df = pd.read_sql(sql, conn)
    finally:
        conn.close()
        
    # Classificação do canal e Faturamento Líquido (regra DAX: Venda - Frete - Devolução)
    if not df.empty:
        df['CANAL'] = df.apply(lambda r: classificar_canal(r['VENDEDOR'], r['MARCA']), axis=1)
        for col in ['VALORVENDA', 'QTDVENDIDA', 'CUSTOGER', 'FRETE', 'VALORDEVOLUCAO']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
        # Faturamento líquido oficial da Diretoria
        df['FAT_LIQUIDO'] = df['VALORVENDA'] - df['FRETE'] - df['VALORDEVOLUCAO']
    else:
        df['CANAL'] = []
        df['FAT_LIQUIDO'] = []

    # Salva no cache
    _MEMORY_CACHE[cache_key] = (df.copy(), now_ts)
    try:
        df.to_pickle(disk_file)
    except Exception as e:
        print(f"[CACHE DISCO] Erro ao salvar {disk_file}: {e}")
        
    return df.copy()


def carregar_pedidos_vtex_mes(ano: int, mes: int, force_refresh: bool = False) -> pd.DataFrame:
    """
    Carrega todos os pedidos faturados VTEX do mês a partir do cache local ou Oracle.
    Permite filtrar qualquer intervalo de dias (1 até dia_fim) diretamente em memória em 0.001s.
    """
    cache_key = f"vtex_{ano}_{mes}"
    disk_file = os.path.join(Config.CACHE_DIR, f"{cache_key}.pkl")
    now_ts = time.time()
    now = datetime.now()
    is_fechado = (ano < now.year) or (ano == now.year and mes < now.month)
    ttl = 86400 * 30 if is_fechado else Config.CACHE_TTL_REALTIME
    
    # 1. Cache em memória
    if not force_refresh and cache_key in _MEMORY_CACHE:
        df, ts = _MEMORY_CACHE[cache_key]
        if now_ts - ts < ttl:
            return df.copy()
            
    # 2. Cache em disco
    if not force_refresh and os.path.exists(disk_file):
        try:
            mtime = os.path.getmtime(disk_file)
            if now_ts - mtime < ttl:
                df = pd.read_pickle(disk_file)
                _MEMORY_CACHE[cache_key] = (df.copy(), mtime)
                return df.copy()
        except Exception:
            pass
            
    # 3. Busca no Oracle se não estiver em cache
    _, max_d = calendar.monthrange(ano, mes)
    dt_ini = f"{ano}-{mes:02d}-01"
    dt_fim = f"{ano+1}-01-01" if mes == 12 else f"{ano}-{mes+1:02d}-01"
    sql = f"""
    SELECT 
        PEDIDO_VTEX,
        CREATION_DATE,
        TO_NUMBER(TO_CHAR(CREATION_DATE, 'DD')) AS DIA,
        NVL(FORMA_PAGAMENTO, 'Outros') AS FORMA_PAGAMENTO,
        NVL(UPPER(TRIM(COUPON)), '(Sem Cupom)') AS COUPON,
        TOTAL_VALUE
    FROM VMQ_VTEXPED_MKT_POWERBI
    WHERE CREATION_DATE >= TO_DATE('{dt_ini}', 'YYYY-MM-DD')
      AND CREATION_DATE < TO_DATE('{dt_fim}', 'YYYY-MM-DD')
      AND STATUS = 'Faturado'
    """
    conn = get_oracle_connection()
    try:
        df = pd.read_sql(sql, conn)
    except Exception as e:
        print(f"[ERRO ORACLE] Pedidos VTEX: {e}")
        if os.path.exists(disk_file):
            try:
                return pd.read_pickle(disk_file)
            except Exception:
                pass
        df = pd.DataFrame(columns=["PEDIDO_VTEX", "CREATION_DATE", "DIA", "FORMA_PAGAMENTO", "COUPON", "TOTAL_VALUE"])
    finally:
        conn.close()
        
    _MEMORY_CACHE[cache_key] = (df.copy(), now_ts)
    try:
        df.to_pickle(disk_file)
    except Exception:
        pass
    return df.copy()


def carregar_formas_pagamento_vtex(ano: int, mes: int, dia_ini: int = 1, dia_fim: int = None, force_refresh: bool = False) -> pd.DataFrame:
    """
    Carrega as formas de pagamento dos pedidos VTEX agregadas para o período especificado.
    Instantâneo: Agrupamento em memória usando Pandas.
    """
    df_raw = carregar_pedidos_vtex_mes(ano, mes, force_refresh=force_refresh)
    if df_raw.empty:
        return pd.DataFrame(columns=["FORMA_PAGAMENTO", "QTD", "TOTAL_VALOR"])
        
    _, max_d = calendar.monthrange(ano, mes)
    d_fim = max_d if dia_fim is None else min(max_d, max(dia_ini, dia_fim))
    
    # Filtro de intervalo de dias em memória (0ms)
    df_f = df_raw[(df_raw["DIA"] >= dia_ini) & (df_raw["DIA"] <= d_fim)]
    if df_f.empty:
        return pd.DataFrame(columns=["FORMA_PAGAMENTO", "QTD", "TOTAL_VALOR"])
        
    df_res = df_f.groupby("FORMA_PAGAMENTO", as_index=False).agg(
        QTD=("PEDIDO_VTEX", "count"),
        TOTAL_VALOR=("TOTAL_VALUE", "sum")
    ).sort_values("TOTAL_VALOR", ascending=False)
    return df_res


def carregar_cupons_vtex(ano: int = 2026, mes: int = 10, dia_ini: int = 1, dia_fim: int = 31, force_refresh: bool = False) -> pd.DataFrame:
    """
    Carrega os cupons promocionais utilizados nos pedidos VTEX faturados.
    Instantâneo: Agrupamento em memória usando Pandas e regra oficial do Power BI.
    """
    df_raw = carregar_pedidos_vtex_mes(ano, mes, force_refresh=force_refresh)
    if df_raw.empty:
        return pd.DataFrame(columns=["COUPON", "TT", "VALOR"])
        
    _, max_d = calendar.monthrange(ano, mes)
    d_fim = min(max_d, max(dia_ini, dia_fim))
    
    # Filtro de intervalo de dias em memória (0ms)
    df_f = df_raw[(df_raw["DIA"] >= dia_ini) & (df_raw["DIA"] <= d_fim)]
    if df_f.empty:
        return pd.DataFrame(columns=["COUPON", "TT", "VALOR"])
        
    # Agrupa por pedido e cupom para evitar duplicações
    ped_cup = df_f.groupby(["PEDIDO_VTEX", "COUPON"], as_index=False).agg(
        VALOR_PEDIDO=("TOTAL_VALUE", "max")
    )
    df_res = ped_cup.groupby("COUPON", as_index=False).agg(
        TT=("PEDIDO_VTEX", "nunique"),
        VALOR=("VALOR_PEDIDO", "sum")
    ).sort_values("VALOR", ascending=False)
    return df_res


if __name__ == "__main__":
    print("Testando carregamento do mês 10/2026...")
    df = carregar_vendas_ecommerce(ano=2026, mes=10, force_refresh=True)
    print(f"Total registros: {len(df)}")
    if not df.empty:
        print("Totais por Canal:")
        print(df.groupby('CANAL')['VALORVENDA'].sum())
    print("\nTestando formas de pagamento VTEX:")
    df_p = carregar_formas_pagamento_vtex(2026, 10, 1, 5, force_refresh=True)
    print(df_p)
