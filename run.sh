#!/bin/bash
# ==============================================================================
# Script de Inicialização - Dashboard Diretoria de E-commerce (Linux)
# MQ Professional
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=== Iniciando Dashboard de E-commerce MQ ==="

# Verifica e cria ambiente virtual se não existir
if [ ! -d "venv" ]; then
    echo "Criando ambiente virtual python3-venv..."
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Cria diretório de cache
mkdir -p cache

# Inicia com Gunicorn se instalado, ou direto pelo python
if command -v gunicorn &> /dev/null; then
    echo "Executando via Gunicorn na porta 5200..."
    exec gunicorn -c gunicorn.conf.py app:app
else
    echo "Executando via Flask direto..."
    exec python3 app.py
fi
