# =============================================================================
# Neifert WhatsApp - saca el servidor del Programador de tareas (y la regla de firewall).
# No borra datos: la sesion (data\sesion), los registros y el .env quedan como estan.
#
# Uso (PowerShell COMO ADMINISTRADOR):
#   powershell -ExecutionPolicy Bypass -File scripts\windows\desinstalar-servicio.ps1
# =============================================================================
$ErrorActionPreference = 'Continue'
foreach ($tarea in @('Neifert WhatsApp - vigia', 'Neifert WhatsApp')) {
  if (Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $tarea -Confirm:$false
    Write-Host "Tarea `"$tarea`" eliminada."
  }
}
Get-NetFirewallRule -DisplayName 'Neifert WhatsApp' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host 'Listo. El servidor ya no arranca solo.'
