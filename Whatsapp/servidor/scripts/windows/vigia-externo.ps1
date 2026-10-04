# =============================================================================
# Neifert WhatsApp - vigia externo (lo corre el Programador de tareas cada 5 minutos).
#
# El servidor ya se vigila a si mismo (alertas de linea caida, celular, etc.), pero si el
# proceso se cuelga nadie avisa. Este script consulta /api/salud desde afuera:
#   - Responde (aunque la linea este desconectada: eso lo maneja el servidor) -> nada.
#   - No responde dos veces seguidas -> reinicia la tarea "Neifert WhatsApp", lo anota en
#     data\logs\vigia-externo.log y, si hay RESEND_API_KEY y WA_ALERTA_EMAIL, avisa por email.
# =============================================================================
$ErrorActionPreference = 'Continue'
$servidor = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logs = Join-Path $servidor 'data\logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$registro = Join-Path $logs 'vigia-externo.log'
$marca = Join-Path $logs 'vigia-externo.fallos'
function Anotar($texto) { Add-Content -Path $registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $texto" }

# Lee una variable de los .env (el del servidor tiene prioridad).
function LeerEnv($nombre) {
  foreach ($f in @((Join-Path $servidor '.env'), (Join-Path $servidor '..\..\.env'))) {
    if (Test-Path $f) {
      $l = Select-String -Path $f -Pattern "^\s*$nombre\s*=\s*(.*)$" | Select-Object -First 1
      if ($l) { return ($l.Matches[0].Groups[1].Value -split '#')[0].Trim().Trim('"') }
    }
  }
  return $null
}

$puerto = LeerEnv 'PUERTO'; if (-not $puerto) { $puerto = LeerEnv 'PORT' }; if (-not $puerto) { $puerto = 3100 }
$vivo = $false
try {
  Invoke-WebRequest -Uri "http://127.0.0.1:$puerto/api/salud" -UseBasicParsing -TimeoutSec 20 | Out-Null
  $vivo = $true
} catch {
  # 503 = el servidor responde pero la linea no esta conectada: el proceso esta vivo.
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 503) { $vivo = $true }
}

if ($vivo) {
  if (Test-Path $marca) { Remove-Item $marca; Anotar 'El servidor volvio a responder.' }
  exit 0
}

$fallos = 1
if (Test-Path $marca) { $fallos = [int](Get-Content $marca) + 1 }
Set-Content -Path $marca -Value $fallos
Anotar "El servidor no responde /api/salud (fallo $fallos)."
if ($fallos -lt 2) { exit 0 } # un fallo suelto puede ser un arranque lento

Anotar 'Reiniciando la tarea "Neifert WhatsApp".'
Stop-ScheduledTask -TaskName 'Neifert WhatsApp' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
# Si quedo un node colgado con el puerto tomado, se cierra.
$ocupado = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ocupado) { Stop-Process -Id $ocupado.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-ScheduledTask -TaskName 'Neifert WhatsApp'

if ($fallos -eq 2) {
  $clave = LeerEnv 'RESEND_API_KEY'; $para = LeerEnv 'WA_ALERTA_EMAIL'
  $de = LeerEnv 'WA_ALERTA_REMITENTE'; if (-not $de) { $de = 'Alertas Neifert <alertas@neifertautomotores.com>' }
  if ($clave -and $para) {
    $cuerpo = @{
      from = $de
      to = @($para -split ',' | ForEach-Object { $_.Trim() })
      subject = 'WhatsApp Neifert: el servidor dejo de responder'
      html = "<p>El servidor de WhatsApp no respondia en la PC $env:COMPUTERNAME. Se reinicio automaticamente a las $(Get-Date -Format 'HH:mm').</p><p>Si vuelve a pasar, revisa data\logs en esa PC.</p>"
    } | ConvertTo-Json
    try {
      Invoke-RestMethod -Uri 'https://api.resend.com/emails' -Method Post -Headers @{ Authorization = "Bearer $clave" } -ContentType 'application/json' -Body $cuerpo | Out-Null
      Anotar 'Alerta enviada por email.'
    } catch { Anotar "No se pudo mandar el email: $($_.Exception.Message)" }
  }
}
