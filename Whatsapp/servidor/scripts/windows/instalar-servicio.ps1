# =============================================================================
# Neifert WhatsApp - instala el servidor como tarea de Windows en la PC titular.
#
#   - Arranca al prender la PC, aunque nadie inicie sesion.
#   - Si el proceso se cae, Windows lo vuelve a levantar (cada 1 minuto, sin limite).
#   - Cada 5 minutos un vigia externo consulta /api/salud: si el servidor no responde,
#     lo reinicia y lo anota en data\logs\vigia-externo.log.
#
# Uso (PowerShell COMO ADMINISTRADOR, en la carpeta Whatsapp\servidor):
#   powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-servicio.ps1
# Opciones:
#   -AbrirFirewall   abre el puerto (3100) en la red privada. Solo si otras PC de la
#                    oficina entran directo por la red (HOST=0.0.0.0). Con Cloudflare
#                    Tunnel NO hace falta.
#   -SinSuspension   evita que la PC se suspenda o hiberne enchufada (recomendado).
#
# Para sacarlo: scripts\windows\desinstalar-servicio.ps1
# Ver docs\OPERACION.md.
# =============================================================================
param(
  [switch]$AbrirFirewall,
  [switch]$SinSuspension
)
$ErrorActionPreference = 'Stop'

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { throw 'Hay que correr este script como Administrador (clic derecho en PowerShell > Ejecutar como administrador).' }

$servidor = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$index = Join-Path $servidor 'index.js'
if (-not (Test-Path $index)) { throw "No encuentro $index. Corre el script desde Whatsapp\servidor." }
if ($servidor -match 'OneDrive') {
  Write-Warning 'La carpeta esta dentro de OneDrive. Para el servicio conviene una carpeta comun (por ejemplo C:\NeifertWhatsapp): OneDrive puede bloquear archivos mientras sincroniza.'
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'No encuentro Node.js. Instalalo (version 20.12 o mas nueva) desde https://nodejs.org y volve a correr el script.' }
$version = & $node --version
Write-Host "Node $version en $node"

if (-not (Test-Path (Join-Path $servidor 'node_modules'))) {
  Write-Host 'Instalando dependencias (npm install)...'
  Push-Location $servidor; try { & npm install --omit=dev } finally { Pop-Location }
}
if (-not (Test-Path (Join-Path $servidor '.env'))) { Write-Warning 'Falta Whatsapp\servidor\.env: el servidor no va a poder arrancar bien. Ver docs\OPERACION.md.' }

$usuario = "$env:USERDOMAIN\$env:USERNAME"
$ajustes = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 9999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
# S4U: corre con este usuario aunque no haya nadie logueado, sin guardar la contrasena.
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType S4U -RunLevel Limited

# 1. El servidor
$accion = New-ScheduledTaskAction -Execute $node -Argument "`"$index`"" -WorkingDirectory $servidor
$alPrender = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'Neifert WhatsApp' -Description 'Servidor de WhatsApp de Neifert Automotores (Whatsapp\servidor\index.js)' `
  -Action $accion -Trigger $alPrender -Settings $ajustes -Principal $principal -Force | Out-Null
Write-Host 'Tarea "Neifert WhatsApp" registrada (arranca al prender la PC).'

# 2. El vigia externo, cada 5 minutos
$vigia = Join-Path $PSScriptRoot 'vigia-externo.ps1'
$accionVigia = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$vigia`"" -WorkingDirectory $servidor
$cada5 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
$ajustesVigia = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Neifert WhatsApp - vigia' -Description 'Reinicia el servidor de WhatsApp si deja de responder /api/salud' `
  -Action $accionVigia -Trigger $cada5 -Settings $ajustesVigia -Principal $principal -Force | Out-Null
Write-Host 'Tarea "Neifert WhatsApp - vigia" registrada (cada 5 minutos).'

# 3. Opcionales
if ($AbrirFirewall) {
  $puerto = 3100
  $envServidor = Join-Path $servidor '.env'
  if (Test-Path $envServidor) {
    $linea = Select-String -Path $envServidor -Pattern '^\s*(PUERTO|PORT)\s*=\s*(\d+)' | Select-Object -First 1
    if ($linea) { $puerto = [int]$linea.Matches[0].Groups[2].Value }
  }
  Get-NetFirewallRule -DisplayName 'Neifert WhatsApp' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName 'Neifert WhatsApp' -Direction Inbound -Protocol TCP -LocalPort $puerto -Action Allow -Profile Private,Domain | Out-Null
  Write-Host "Firewall: abierto el puerto TCP $puerto en redes privadas y de dominio."
}
if ($SinSuspension) {
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  Write-Host 'Energia: la PC no se suspende ni hiberna enchufada.'
}

# 4. Arrancar ya
Start-ScheduledTask -TaskName 'Neifert WhatsApp'
Start-Sleep -Seconds 8
try {
  $salud = Invoke-RestMethod -Uri "http://127.0.0.1:3100/api/salud" -TimeoutSec 10
  Write-Host "Servidor respondiendo. Linea: $($salud.conexion)"
} catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 503) {
    Write-Host 'Servidor respondiendo (la linea todavia no esta conectada: puede tardar unos segundos o necesitar el QR).'
  } else {
    Write-Warning "El servidor todavia no responde ($($_.Exception.Message)). Mira data\logs\ o el Visor de eventos > Programador de tareas."
  }
}
Write-Host "`nListo. Para probar: reinicia la PC y, sin iniciar sesion, abri http://<esta-PC>:3100/api/salud desde otra maquina (o espera la alerta)."
