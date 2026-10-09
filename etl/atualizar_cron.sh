#!/bin/bash
# Script de atualizacao do ETL E-commerce para execucao no Linux / Crontab (ex: servidor 10.11.1.227)
# Sugestao no crontab (todo dia as 21:00):
# 0 21 * * * /bin/bash /caminho/do/projeto/etl/atualizar_cron.sh >> /caminho/do/projeto/logs/cron.log 2>&1

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================="
echo "Iniciando sincronizacao E-commerce: $(date '+%Y-%m-%d %H:%M:%S')"
python3 -m etl.atualizar_dados
EXIT_CODE=$?
echo "Concluido com codigo $EXIT_CODE: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================="
exit $EXIT_CODE
