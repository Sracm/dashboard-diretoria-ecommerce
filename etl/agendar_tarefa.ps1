# Registra no Agendador de Tarefas do Windows a atualizacao do Dashboard E-commerce
# Executar no PowerShell como Administrador:
#   powershell -ExecutionPolicy Bypass -File etl\agendar_tarefa.ps1
# Para remover:
#   Unregister-ScheduledTask -TaskName "Dashboard Ecommerce - Atualizar Dados MariaDB" -Confirm:$false

param(
    [string]$Horario = "21:00",
    [string]$Python = (Get-Command python).Source
)

$projeto = Split-Path -Parent $PSScriptRoot
$nome = "Dashboard Ecommerce - Atualizar Dados MariaDB"

$acao = New-ScheduledTaskAction -Execute $Python -Argument "-m etl.atualizar_dados" -WorkingDirectory $projeto
$gatilho = New-ScheduledTaskTrigger -Daily -At $Horario
$config = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config `
    -Description "Extrai dados de Vendas e VTEX do Oracle Sankhya e carrega no MariaDB (ecommerce_performance)" `
    -RunLevel Highest -Force | Out-Null

Write-Host "Tarefa '$nome' registrada com sucesso!" -ForegroundColor Green
Write-Host "Horario: Diariamente as $Horario" -ForegroundColor Cyan
Write-Host "Python:  $Python" -ForegroundColor Gray
Write-Host "Projeto: $projeto" -ForegroundColor Gray
