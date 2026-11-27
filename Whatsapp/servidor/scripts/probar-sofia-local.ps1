# Prueba local de Sofia con tu propio numero (guia completa: Whatsapp/docs/PRUEBA-SOFIA-CONMIGO.md).
# Abre 3 ventanas: BOT IA (con Gemini real), el servidor de licencias (base local en memoria, no toca produccion)
# y el servidor de WhatsApp de Neifert en la PC (lo que ve el panel del CRM). Cerrar las ventanas las apaga.
#
#   powershell -ExecutionPolicy Bypass -File Whatsapp\servidor\scripts\probar-sofia-local.ps1
#
# Antes: tener BOT-IA\.env y BOT-Pagos\bot-pagos\server\.env (los de "env para probar en local").
$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path

function Faltan($ruta, $para) {
  if (-not (Test-Path $ruta)) { throw "Falta $ruta ($para)." }
}
Faltan (Join-Path $raiz 'BOT-IA\.env') 'el .env de BOT IA con la clave de Gemini'
Faltan (Join-Path $raiz 'BOT-Pagos\bot-pagos\server\.env') 'el .env del servidor de licencias'
Faltan (Join-Path $raiz '.env') 'el .env de Neifert con las claves de Supabase'

# Variable de un .env, sin mostrarla.
function Valor($archivo, $nombre) {
  $linea = Get-Content $archivo | Where-Object { $_ -match "^$nombre=" } | Select-Object -First 1
  if (-not $linea) { return '' }
  return ($linea -replace "^$nombre=", '').Trim().Trim('"').Trim("'")
}

# .env del servidor de WhatsApp de la PC (si no existe): modo local (sin la base del WhatsApp), con el catalogo y el CRM reales.
$envServidor = Join-Path $raiz 'Whatsapp\servidor\.env'
if (-not (Test-Path $envServidor)) {
  $secreto = -join ((48..57) + (97..102) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
  $rootEnv = Join-Path $raiz '.env'
  @(
    'HOST=127.0.0.1',
    'PUERTO=3100',
    'ALMACEN=local',
    "SUPABASE_URL=$(Valor $rootEnv 'VITE_SUPABASE_URL')",
    "SUPABASE_ANON_KEY=$(Valor $rootEnv 'VITE_SUPABASE_ANON_KEY')",
    "SUPABASE_SERVICE_ROLE_KEY=$(Valor $rootEnv 'SUPABASE_SERVICE_ROLE_KEY')",
    'CRM_URL=https://neifertautomotores.com/crm/whatsapp',
    "WA_BOT_SECRETO=$secreto"
  ) | Set-Content -Path $envServidor -Encoding UTF8
  Write-Host "Creado Whatsapp\servidor\.env" -ForegroundColor Green
}
$secretoBot = Valor $envServidor 'WA_BOT_SECRETO'

function Ventana($titulo, $carpeta, $comando) {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$carpeta'; $comando"
}
Ventana 'BOT IA (3002)' (Join-Path $raiz 'BOT-IA') 'npm start'
Ventana 'Licencias (3001 y web 5173)' (Join-Path $raiz 'BOT-Pagos\bot-pagos') 'npm run dev'
Ventana 'Servidor WhatsApp Neifert (3100)' (Join-Path $raiz 'Whatsapp\servidor') 'npm start'

Write-Host ''
Write-Host 'Listo. En la app del bot, pestaña Asistente IA > CRM:' -ForegroundColor Cyan
Write-Host '  Direccion: http://localhost:3100/api/bot'
Write-Host "  Secreto:   $secretoBot"
Write-Host ''
Write-Host 'Siguiente paso: Whatsapp\docs\PRUEBA-SOFIA-CONMIGO.md (paso 2 en adelante).'
