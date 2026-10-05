/*
 * App de escritorio de la PC que hace de servidor del WhatsApp de Neifert.
 *
 * Qué hace:
 *   - Corre el servidor de WhatsApp (Whatsapp/servidor) como proceso hijo, con el Node que
 *     trae la app, y lo vuelve a levantar si se cae.
 *   - Si la configuración trae WA_TUNEL_TOKEN, corre Cloudflare Tunnel (cloudflared) para
 *     que el CRM llegue a esta PC por https (wa.<dominio>).
 *   - Ícono junto al reloj y una ventanita de estado: muestra el QR cuando hay que vincular
 *     la línea (se abre sola en ese caso) y, si no, el número conectado. El WhatsApp se usa
 *     desde el CRM, en el navegador: esta app no lo muestra.
 *   - Arranca sola con Windows (oculta, solo el ícono). Cerrar la ventana no la apaga.
 *
 * La configuración (el .env del servidor) se elige una vez desde un archivo y queda cifrada
 * con Windows (safeStorage/DPAPI) en %APPDATA%\Neifert WhatsApp. No viaja por internet.
 * Los datos de la línea (sesión, registros) quedan en %APPDATA%\Neifert WhatsApp\data.
 */
const { app, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, ipcMain, nativeImage, nativeTheme, safeStorage, shell } = require('electron')
const { fork, spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { parseEnv } = require('node:util')
const { credencialesR2, r2Get } = require('./r2.cjs')
const { leerRegistros } = require('./registros.cjs')

// Datos en %APPDATA%Neifert WhatsApp (y no con el nombre interno del paquete).
// WA_DATOS_APP: otra carpeta (para pruebas, sin tocar la instalación de esta PC).
app.setPath('userData', process.env.WA_DATOS_APP || path.join(app.getPath('appData'), 'Neifert WhatsApp'))

const PUERTO = Number(process.env.WA_PUERTO_APP) || 3100
const URL_PANEL = `http://127.0.0.1:${PUERTO}/`
const DATOS = app.getPath('userData')
const DATA_DIR = path.join(DATOS, 'data')
const ARCHIVO_CONFIG = path.join(DATOS, 'config.cifrada')
const LOG_APP = path.join(DATOS, 'app.log')
// Empaquetada: la versión inicial del servidor, ffmpeg y cloudflared van en resources/.
// En desarrollo se usa el servidor del repo (Whatsapp/servidor) y no se actualiza solo.
const RECURSOS = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build')
const INCLUIDO = app.isPackaged ? path.join(RECURSOS, 'app-servidor') : path.join(__dirname, '..')
const CLOUDFLARED = path.join(RECURSOS, 'bin', 'cloudflared.exe')
const FFMPEG = path.join(RECURSOS, 'bin', 'ffmpeg.exe')
const ICONO = path.join(__dirname, 'icono.png')
const ARCHIVO_PID = path.join(DATOS, 'servidor.pid')
// Clave de este arranque para pedirle al servidor el estado y el QR sin login del CRM
// (ver /api/local/estado en el servidor). No se guarda en ningún lado.
const CLAVE_LOCAL = crypto.randomBytes(24).toString('hex')
// Versiones del servidor bajadas de R2 (ver scripts/publicar.mjs).
const VERSIONES = path.join(DATOS, 'versiones')
const ARCHIVO_ACTUAL = path.join(VERSIONES, 'actual.json')
const ARCHIVO_MALAS = path.join(VERSIONES, 'malas.json')
const ACTUALIZA = app.isPackaged || process.env.WA_ACTUALIZAR === '1'

// Lo mínimo para que el servidor arranque (con nombres alternativos aceptados).
const OBLIGATORIAS = [
  ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
  ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
  ['SUPABASE_SERVICE_ROLE_KEY'],
  ['WA_DATABASE_URL', 'WA_SUPABASE_URL'],
]
// Sin estas arranca, pero falta algo importante.
const RECOMENDADAS = {
  CRM_URL: 'el CRM no va a poder mostrar el panel',
  WA_R2_BUCKET: 'los archivos quedan solo en esta PC',
  WA_TUNEL_TOKEN: 'el CRM no llega a esta PC desde internet',
  WA_BACKUP_CLAVE: 'no hay respaldo de la sesión',
}

if (!app.requestSingleInstanceLock()) app.quit()

/* ---------------- Registro de la app ---------------- */

function registrar(texto) {
  const linea = `[${new Date().toLocaleString('es-AR', { hour12: false })}] ${texto}\n`
  try {
    fs.mkdirSync(DATOS, { recursive: true })
    if (fs.existsSync(LOG_APP) && fs.statSync(LOG_APP).size > 5 * 1024 * 1024) fs.renameSync(LOG_APP, `${LOG_APP}.1`)
    fs.appendFileSync(LOG_APP, linea)
  } catch {}
}

/* ---------------- Configuración cifrada ---------------- */

function leerConfig() {
  try {
    return parseEnv(safeStorage.decryptString(fs.readFileSync(ARCHIVO_CONFIG)))
  } catch {
    return null
  }
}

const valor = (config, nombres) => nombres.map((n) => config[n]).find(Boolean) || ''

function revisarConfig(texto) {
  let config
  try {
    config = parseEnv(texto)
  } catch (err) {
    return { ok: false, error: `El archivo no tiene el formato de un .env: ${err.message}` }
  }
  const faltan = OBLIGATORIAS.filter((nombres) => !valor(config, nombres)).map((n) => n[0])
  const avisos = Object.entries(RECOMENDADAS)
    .filter(([n]) => !config[n])
    .map(([n, efecto]) => `${n}: ${efecto}`)
  return { ok: faltan.length === 0, faltan, avisos, config }
}

/* ---------------- Número de la línea ---------------- */

// El número no va en el archivo de configuración: se escribe en la app y queda guardado acá
// (junto con si el servidor arranca solo al prender la PC).
const ARCHIVO_AJUSTES = path.join(DATOS, 'ajustes.json')
const leerAjustes = () => {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_AJUSTES, 'utf8'))
  } catch {
    return {}
  }
}
function guardarAjustes(cambios) {
  fs.mkdirSync(DATOS, { recursive: true })
  fs.writeFileSync(ARCHIVO_AJUSTES, JSON.stringify({ ...leerAjustes(), ...cambios }, null, 2))
}

/**
 * El número se escribe como un celular argentino "local": característica sin el 0 y número
 * sin el 15, 10 dígitos en total (3492 123456, 11 2345 6789). Nada de +54 ni 9: eso lo
 * agrega la app (WhatsApp lo usa como 549 + característica + número).
 */
function validarNumero(texto) {
  const crudo = String(texto ?? '').trim()
  const mal = (error) => ({ ok: false, error })
  if (!crudo) return mal('Escribí el número de la línea.')
  if (/[^\d\s-]/.test(crudo)) return mal('Solo números (podés separar con espacios o guiones), sin + ni paréntesis.')
  const d = crudo.replace(/\D/g, '')
  if (d.startsWith('0')) return mal('Sin el 0 adelante: la característica va sin 0 (3492, no 03492).')
  if (d.startsWith('54')) return mal('Sin el 54 (código de país): solo característica y número.')
  if (d.startsWith('9')) return mal('Sin el 9 adelante: solo característica y número.')
  if (d.length === 12 && /^\d{2,4}15/.test(d)) return mal('Sin el 15: el número va sin el 15 después de la característica.')
  if (!/^[123]/.test(d)) return mal('La característica empieza con 1, 2 o 3 (por ejemplo 11, 341 o 3492).')
  if (d.length !== 10) return mal(`Tienen que ser 10 dígitos entre característica y número; escribiste ${d.length}.`)
  return { ok: true, numero: d, linea: `549${d}` }
}

/** La línea guardada, como la usa WhatsApp (549 + 10 dígitos), o '' si no hay. */
const lineaGuardada = () => {
  const r = validarNumero(leerAjustes().numero)
  return r.ok ? r.linea : ''
}

/* ---------------- Servidor y túnel ---------------- */

let servidor = null
let tunel = null
let saliendo = false
let reintentos = 0

function salidaA(nombre, flujo) {
  flujo?.on('data', (d) => {
    for (const linea of String(d).split(/\r?\n/)) if (linea.trim()) registrar(`${nombre}: ${linea}`)
  })
}

const leerJson = (archivo, porDefecto) => {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'))
  } catch {
    return porDefecto
  }
}
const versionIncluida = () => leerJson(path.join(INCLUIDO, 'version.json'), {}).version || 'desarrollo'

/** Qué servidor corre: la última versión bajada que funcionó, o la que trae el instalador. */
function servidorActual() {
  const actual = ACTUALIZA ? leerJson(ARCHIVO_ACTUAL, null) : null
  // Un instalador más nuevo que la última versión bajada manda (las versiones empiezan con la fecha).
  if (actual?.version && actual.version > versionIncluida()) {
    const dir = path.join(VERSIONES, actual.version, 'app-servidor')
    if (fs.existsSync(path.join(dir, 'servidor', 'index.js'))) return { dir, version: actual.version, anterior: actual.anterior || null }
  }
  return { dir: INCLUIDO, version: versionIncluida(), anterior: null }
}

let arranque = { ts: 0, version: null }
let fallosSeguidos = 0

/** Variables con las que corre el servidor (y sus scripts): la configuración + lo de la app. */
function entornoServidor(config) {
  return {
    ...process.env,
    ...config,
    ELECTRON_RUN_AS_NODE: '1',
    DATA_DIR,
    HOST: '127.0.0.1',
    PUERTO: String(PUERTO),
    // Con el túnel, el https y la IP real los informa Cloudflare.
    WA_DETRAS_DE_PROXY: config.WA_TUNEL_TOKEN ? 'on' : config.WA_DETRAS_DE_PROXY || 'off',
    ...(fs.existsSync(FFMPEG) ? { WA_FFMPEG: FFMPEG } : {}),
    WA_CLAVE_LOCAL: CLAVE_LOCAL,
    // El número escrito en la app manda sobre cualquier WHATSAPP_NUMERO de la configuración.
    WHATSAPP_NUMERO: lineaGuardada(),
  }
}

let iniciado = false // alguien tocó "Iniciar servidor" (o arrancó solo con la PC)

function arrancarServidor() {
  if (servidor || saliendo || !iniciado) return
  const config = leerConfig()
  if (!config || !lineaGuardada()) return
  const { dir, version } = servidorActual()
  const carpeta = path.join(dir, 'servidor')
  const env = entornoServidor(config)
  registrar(`Iniciando el servidor de WhatsApp (versión ${version})`)
  arranque = { ts: Date.now(), version }
  servidor = fork(path.join(carpeta, 'index.js'), [], { cwd: carpeta, env, execPath: process.execPath, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  try {
    fs.writeFileSync(ARCHIVO_PID, String(servidor.pid))
  } catch {}
  salidaA('servidor', servidor.stdout)
  salidaA('servidor', servidor.stderr)
  servidor.on('exit', (codigo) => {
    servidor = null
    if (saliendo) return
    // Una versión bajada que se cae enseguida, tres veces seguidas: se vuelve a la anterior.
    if (Date.now() - arranque.ts < 90_000) fallosSeguidos++
    else fallosSeguidos = 0
    if (fallosSeguidos >= 3 && volverAVersionAnterior(arranque.version)) {
      fallosSeguidos = 0
      reintentos = 0
      return setTimeout(arrancarServidor, 1000)
    }
    const espera = Math.min(60_000, 2000 * 2 ** Math.min(reintentos++, 5))
    registrar(`El servidor se cerró (código ${codigo}); se reinicia en ${espera / 1000} s`)
    setTimeout(arrancarServidor, espera)
  })
}

/* ---------------- Actualizaciones del servidor (R2) ---------------- */

const R2_PREFIJO = 'app/servidor/'

let buscando = false
let ultimaBusqueda = null // { ts, resultado }

/**
 * Se fija si hay una versión nueva publicada; si la hay, la baja, verifica su huella, la
 * descomprime y reinicia el servidor con ella. Devuelve un texto para mostrar.
 */
async function buscarActualizacion() {
  if (!ACTUALIZA) return 'En modo desarrollo no se actualiza solo.'
  if (buscando) return 'Ya se está buscando.'
  const config = leerConfig()
  const r2 = config && credencialesR2(config)
  if (!r2) return 'Sin R2 en la configuración: no hay de dónde bajar versiones nuevas.'
  buscando = true
  try {
    const ficha = JSON.parse((await r2Get(r2, `${R2_PREFIJO}ultima.json`))?.toString('utf8') || 'null')
    const actual = servidorActual()
    // Las versiones empiezan con fecha y hora: solo se toma una más nueva que la actual.
    if (!ficha?.version || ficha.version <= actual.version) return `Está al día (versión ${actual.version}).`
    if (leerJson(ARCHIVO_MALAS, []).includes(ficha.version)) return `La versión ${ficha.version} falló al arrancar; se sigue con la ${actual.version}.`

    registrar(`Versión nueva publicada: ${ficha.version}. Bajando…`)
    const datos = await r2Get(r2, ficha.archivo)
    if (!datos) throw new Error('El paquete publicado no está en R2')
    const huella = require('node:crypto').createHash('sha256').update(datos).digest('hex')
    if (huella !== ficha.sha256) throw new Error('El paquete bajado no coincide con su huella (se descarta)')

    const destino = path.join(VERSIONES, ficha.version)
    fs.rmSync(destino, { recursive: true, force: true })
    fs.mkdirSync(destino, { recursive: true })
    const archivo = path.join(destino, 'paquete.tar.gz')
    fs.writeFileSync(archivo, datos)
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    await new Promise((resolve, reject) => {
      const p = spawn(tar, ['-xzf', 'paquete.tar.gz'], { cwd: destino, windowsHide: true })
      p.on('error', reject)
      p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`No se pudo descomprimir (tar salió con ${c})`))))
    })
    fs.rmSync(archivo, { force: true })
    if (!fs.existsSync(path.join(destino, 'app-servidor', 'servidor', 'index.js'))) throw new Error('El paquete no tiene el servidor')

    fs.writeFileSync(ARCHIVO_ACTUAL, JSON.stringify({ version: ficha.version, anterior: actual.version, desde: new Date().toISOString() }, null, 2))
    registrar(`Pasando a la versión ${ficha.version} (antes ${actual.version})`)
    limpiarVersiones()
    await reiniciarTodo()
    return `Actualizado a la versión ${ficha.version}.`
  } catch (err) {
    registrar(`No se pudo actualizar: ${err.message}`)
    return `No se pudo actualizar: ${err.message}`
  } finally {
    buscando = false
  }
}

/** La versión `mala` no arranca: se anota y se vuelve a la anterior (o a la del instalador). */
function volverAVersionAnterior(mala) {
  const actual = leerJson(ARCHIVO_ACTUAL, null)
  if (!actual?.version || actual.version !== mala) return false
  const malas = leerJson(ARCHIVO_MALAS, [])
  fs.writeFileSync(ARCHIVO_MALAS, JSON.stringify([...new Set([...malas, mala])].slice(-20)))
  const anterior = actual.anterior && fs.existsSync(path.join(VERSIONES, actual.anterior)) ? actual.anterior : null
  if (anterior) fs.writeFileSync(ARCHIVO_ACTUAL, JSON.stringify({ version: anterior, anterior: null, desde: new Date().toISOString() }, null, 2))
  else fs.rmSync(ARCHIVO_ACTUAL, { force: true })
  const destino = anterior || `la del instalador (${versionIncluida()})`
  registrar(`La versión ${mala} se cae al arrancar: se vuelve a ${destino}`)
  if (Notification.isSupported()) new Notification({ title: 'WhatsApp de Neifert', body: `La versión nueva del servidor falló; se volvió a ${destino}.` }).show()
  return true
}

/** Deja solo la versión actual y la anterior. */
function limpiarVersiones() {
  const { version, anterior } = leerJson(ARCHIVO_ACTUAL, {})
  for (const d of fs.existsSync(VERSIONES) ? fs.readdirSync(VERSIONES) : []) {
    const ruta = path.join(VERSIONES, d)
    if (fs.statSync(ruta).isDirectory() && d !== version && d !== anterior) fs.rmSync(ruta, { recursive: true, force: true })
  }
}

async function buscarYAvisar(manual = false) {
  const resultado = await buscarActualizacion()
  ultimaBusqueda = { ts: Date.now(), resultado }
  actualizarIcono()
  if (manual) dialog.showMessageBox({ type: 'info', title: 'Actualización del servidor', message: resultado })
}

function arrancarTunel() {
  if (tunel || saliendo || !iniciado) return
  const token = leerConfig()?.WA_TUNEL_TOKEN
  if (!token) return
  if (!fs.existsSync(CLOUDFLARED)) return registrar(`Falta cloudflared en ${CLOUDFLARED}: el CRM no va a llegar a esta PC`)
  registrar('Iniciando Cloudflare Tunnel')
  // El token va por variable de entorno, no en la línea de comandos (ahí lo ve cualquiera).
  tunel = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', 'run'], {
    env: { ...process.env, TUNNEL_TOKEN: token },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  salidaA('túnel', tunel.stdout)
  salidaA('túnel', tunel.stderr)
  tunel.on('exit', (codigo) => {
    tunel = null
    if (saliendo) return
    registrar(`El túnel se cerró (código ${codigo}); se reinicia en 10 s`)
    setTimeout(arrancarTunel, 10_000)
  })
}

/** Apaga el servidor ordenadamente (guarda lo pendiente); a los 12 s lo corta. */
function apagarServidor() {
  return new Promise((resolve) => {
    if (!servidor) return resolve()
    const s = servidor
    const corte = setTimeout(() => {
      try {
        s.kill()
      } catch {}
      resolve()
    }, 12_000)
    s.once('exit', () => {
      clearTimeout(corte)
      resolve()
    })
    try {
      s.send({ tipo: 'cerrar' })
    } catch {
      s.kill()
    }
  })
}

function apagarTunel() {
  try {
    tunel?.kill()
  } catch {}
  tunel = null
}

async function reiniciarTodo() {
  saliendo = true
  await apagarServidor()
  apagarTunel()
  saliendo = false
  reintentos = 0
  arrancarServidor()
  arrancarTunel()
}

/* ---------------- Estado de la línea ---------------- */

const TEXTO_ESTADO = {
  detenido: 'Servidor detenido',
  conectado: 'Conectado',
  qr: 'Hay que escanear el QR',
  conectando: 'Conectando…',
  desconectado: 'Sin conexión',
  iniciando: 'Iniciando…',
}
let estado = { conexion: 'iniciando', ok: false }
let desconectadoDesde = null
let ultimoRechazo = null
let avisado = false

async function consultarEstado() {
  const anterior = estado.conexion
  try {
    const r = await fetch(`${URL_PANEL}api/local/estado`, { headers: { 'x-nf-local': CLAVE_LOCAL }, signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(String(r.status))
    const e = await r.json()
    estado = { ...e, ok: e.conexion === 'conectado' }
  } catch {
    estado = { conexion: !iniciado ? 'detenido' : servidor ? 'iniciando' : 'desconectado', ok: false }
  }
  if (estado.ok || !iniciado) {
    reintentos = 0
    desconectadoDesde = null
    avisado = false
  } else {
    desconectadoDesde ??= Date.now()
    // Hay que vincular la línea: se abre la ventana con el QR y se avisa.
    if (estado.conexion === 'qr' && anterior !== 'qr') {
      abrirVentana()
      if (Notification.isSupported()) new Notification({ title: 'WhatsApp de Neifert', body: 'Hay que escanear el QR con el celular de la concesionaria.' }).show()
    } else if (!avisado && estado.conexion !== 'qr' && Date.now() - desconectadoDesde > 5 * 60_000 && Notification.isSupported()) {
      // 5 minutos sin conectar (las alertas por email las manda el servidor).
      avisado = true
      new Notification({ title: 'WhatsApp de Neifert sin conexión', body: `${TEXTO_ESTADO[estado.conexion] || estado.conexion}. Abrí la app para ver qué pasa.` }).show()
    }
  }
  // Escanearon con otro número: el servidor lo desvinculó. Se avisa una vez por rechazo.
  if (estado.rechazo?.ts && estado.rechazo.ts !== ultimoRechazo) {
    ultimoRechazo = estado.rechazo.ts
    abrirVentana()
    if (Notification.isSupported()) {
      new Notification({ title: 'Número equivocado', body: `Se escaneó con ${estado.rechazo.telefono || 'otro número'}, que no es el de esta línea. Escaneá con el celular correcto.` }).show()
    }
  }
  if (anterior !== estado.conexion) actualizarIcono()
  ventana?.webContents.send('estado', vistaEstado())
}

/** Lo que ve la ventanita: estado, QR, número conectado y versión. */
function vistaEstado() {
  const config = leerConfig() || {}
  return {
    conexion: estado.conexion,
    texto: TEXTO_ESTADO[estado.conexion] || estado.conexion,
    qr: estado.qr || null,
    telefono: estado.telefono || null,
    nombre: estado.nombre || null,
    numeroLinea: estado.numeroLinea || null,
    rechazo: estado.rechazo || null,
    crm: config.CRM_URL || null,
    version: servidorActual().version,
    // Para la pantalla de inicio: número guardado (10 dígitos) y si arranca solo con la PC.
    iniciado,
    numero: leerAjustes().numero || '',
    autoInicio: leerAjustes().autoInicio !== false,
  }
}

/** "Iniciar servidor": valida y guarda el número, y arranca el servidor y el túnel. */
async function iniciarServidor({ numero, autoInicio = true } = {}) {
  const r = validarNumero(numero)
  if (!r.ok) return r
  const cambio = leerAjustes().numero !== r.numero
  guardarAjustes({ numero: r.numero, autoInicio: !!autoInicio })
  app.setLoginItemSettings({ openAtLogin: true, args: ['--oculto'] })
  registrar(`Iniciar servidor con la línea +${r.linea}${cambio ? ' (número nuevo)' : ''}`)
  iniciado = true
  // Con otro número el servidor tiene que arrancar de nuevo: cada línea tiene sus datos.
  if (cambio && servidor) await reiniciarTodo()
  else {
    reintentos = 0
    arrancarServidor()
    arrancarTunel()
  }
  actualizarIcono()
  setTimeout(consultarEstado, 1500)
  return { ok: true, linea: r.linea }
}

/** Detiene el servidor (para cambiar el número); la app queda abierta. */
async function detenerServidor() {
  registrar('Servidor detenido desde la app')
  iniciado = false
  saliendo = true
  await apagarServidor()
  apagarTunel()
  saliendo = false
  estado = { conexion: 'detenido', ok: false }
  actualizarIcono()
  ventana?.webContents.send('estado', vistaEstado())
}

// Con la ventana abierta se consulta seguido (el QR cambia cada ~20 s); si no, cada 15 s.
function programarConsulta() {
  setTimeout(async () => {
    await consultarEstado()
    programarConsulta()
  }, ventana?.isVisible() ? 2000 : 15_000)
}

/* ---------------- Ventanas ---------------- */

let ventana = null
let ventanaConfig = null
let icono = null

function abrirVentana() {
  if (!leerConfig()) return abrirConfig()
  if (ventana) {
    ventana.show()
    ventana.focus()
    return
  }
  ventana = new BrowserWindow({
    width: 460,
    height: 760,
    resizable: false,
    maximizable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111114' : '#f4f2ef',
    title: 'Servidor de WhatsApp — Neifert',
    icon: ICONO,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  ventana.removeMenu()
  ventana.once('ready-to-show', () => ventana.show())
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  ventana.webContents.on('will-navigate', (e) => e.preventDefault())
  // Cerrar la ventana no apaga el servidor: queda el ícono junto al reloj.
  ventana.on('close', (e) => {
    if (saliendo) return
    e.preventDefault()
    ventana.hide()
  })
  ventana.on('closed', () => (ventana = null))
  ventana.loadFile(path.join(__dirname, 'ventana', 'estado.html'))
}

/** Abre el WhatsApp (en el CRM) en el navegador. */
function abrirWhatsappWeb() {
  const url = leerConfig()?.CRM_URL
  if (url && /^https?:\/\//.test(url)) shell.openExternal(url)
}

/* Registros: lo del servidor, la app y el túnel, con qué significa cada error. */
let ventanaRegistros = null
function abrirRegistros() {
  if (ventanaRegistros) {
    ventanaRegistros.show()
    return ventanaRegistros.focus()
  }
  ventanaRegistros = new BrowserWindow({
    width: 820,
    height: 640,
    minWidth: 560,
    minHeight: 400,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111114' : '#f4f2ef',
    title: 'Registros — Neifert WhatsApp',
    icon: ICONO,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  ventanaRegistros.removeMenu()
  ventanaRegistros.webContents.on('will-navigate', (e) => e.preventDefault())
  ventanaRegistros.on('closed', () => (ventanaRegistros = null))
  ventanaRegistros.loadFile(path.join(__dirname, 'ventana', 'registros.html'))
}

function abrirConfig() {
  if (ventanaConfig) return ventanaConfig.focus()
  ventanaConfig = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: false,
    maximizable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111114' : '#f4f2ef',
    title: 'Configuración — Neifert WhatsApp',
    icon: ICONO,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  ventanaConfig.removeMenu()
  // Soltar un archivo afuera de la zona de arrastre no tiene que abrirlo en la ventana.
  ventanaConfig.webContents.on('will-navigate', (e) => e.preventDefault())
  ventanaConfig.on('closed', () => (ventanaConfig = null))
  ventanaConfig.loadFile(path.join(__dirname, 'ventana', 'config.html'))
}

/* ---------------- Ícono junto al reloj ---------------- */

function actualizarIcono() {
  if (!icono) return
  const texto = TEXTO_ESTADO[estado.conexion] || estado.conexion
  icono.setToolTip(`Neifert WhatsApp — ${leerConfig() ? texto : 'falta configurar'}`)
  const inicio = app.getLoginItemSettings({ args: ['--oculto'] }).openAtLogin
  icono.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Estado: ${leerConfig() ? texto : 'falta configurar'}`, enabled: false },
      { label: `Versión del servidor: ${servidorActual().version}`, enabled: false },
      ...(ultimaBusqueda ? [{ label: `Última revisión: ${ultimaBusqueda.resultado}`.slice(0, 110), enabled: false }] : []),
      { type: 'separator' },
      iniciado
        ? { label: 'Ver estado de la línea', click: abrirVentana }
        : { label: 'Iniciar servidor…', enabled: !!leerConfig(), click: abrirVentana },
      { label: 'Abrir WhatsApp en el navegador', enabled: !!leerConfig()?.CRM_URL, click: abrirWhatsappWeb },
      { label: 'Reiniciar el servidor', enabled: iniciado, click: () => reiniciarTodo() },
      { label: buscando ? 'Buscando actualización…' : 'Buscar actualización ahora', enabled: ACTUALIZA && !buscando && !!leerConfig(), click: () => buscarYAvisar(true) },
      { label: 'Ver registros', click: abrirRegistros },
      { label: 'Cambiar configuración…', click: abrirConfig },
      { label: 'Restaurar la sesión desde el respaldo…', enabled: !!leerConfig(), click: () => restaurarSesion() },
      {
        label: 'Iniciar con Windows',
        type: 'checkbox',
        checked: inicio,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--oculto'] }),
      },
      { type: 'separator' },
      { label: 'Apagar el servidor y salir', click: confirmarSalida },
    ]),
  )
}

/**
 * PC nueva (o sesión perdida): trae la sesión de WhatsApp del respaldo cifrado en R2, así
 * la línea conecta sin escanear el QR. La otra PC tiene que estar apagada.
 */
async function restaurarSesion() {
  const config = leerConfig()
  if (!config?.WA_BACKUP_CLAVE || !credencialesR2(config)) {
    return dialog.showMessageBox({ type: 'warning', title: 'Restaurar la sesión', message: 'La configuración no tiene WA_BACKUP_CLAVE y R2: no hay respaldo del que traer la sesión.' })
  }
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Restaurar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    title: 'Restaurar la sesión desde el respaldo',
    message: 'Se reemplaza la sesión de WhatsApp de esta PC por la del último respaldo.',
    detail: 'La PC que era el servidor antes tiene que estar APAGADA (o sin la app abierta). Si las dos se conectan con la misma sesión, se desconectan entre sí.',
  })
  if (response !== 0) return
  saliendo = true
  await apagarServidor()
  apagarTunel()
  const carpeta = path.join(servidorActual().dir, 'servidor')
  const salida = []
  const codigo = await new Promise((resolve) => {
    const p = fork(path.join(carpeta, 'scripts', 'restaurar.mjs'), ['--sin-env', '--forzar'], {
      cwd: carpeta,
      env: entornoServidor(config),
      execPath: process.execPath,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    for (const f of [p.stdout, p.stderr]) f.on('data', (d) => salida.push(String(d)))
    p.on('exit', resolve)
  })
  const texto = salida.join('').replace(/npm start|npm run restaurar/g, 'la app').trim()
  registrar(`Restaurar sesión (código ${codigo}): ${texto.replace(/\s+/g, ' ').slice(0, 300)}`)
  saliendo = false
  reintentos = 0
  arrancarServidor()
  arrancarTunel()
  dialog.showMessageBox({ type: codigo === 0 ? 'info' : 'error', title: 'Restaurar la sesión', message: codigo === 0 ? 'Sesión restaurada. El servidor arranca con ella.' : 'No se pudo restaurar la sesión.', detail: texto.slice(-1500) })
}

async function confirmarSalida() {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Apagar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    title: 'Apagar el servidor',
    message: 'Si apagás el servidor, nadie va a poder usar el WhatsApp desde el CRM hasta que se vuelva a abrir la app.',
    detail: 'Los mensajes que lleguen mientras tanto los entrega WhatsApp cuando vuelva a conectar.',
  })
  if (response === 0) salir()
}

/**
 * Si la app anterior se cerró de golpe, su servidor pudo quedar corriendo solo (ocupa el
 * puerto y el nuevo no arranca). Se lo cierra antes de empezar.
 */
async function cerrarHuerfano() {
  let pid
  try {
    pid = Number(fs.readFileSync(ARCHIVO_PID, 'utf8'))
  } catch {
    return
  }
  const responde = await fetch(`${URL_PANEL}api/salud`, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false)
  if (!pid || !responde) return
  try {
    process.kill(pid)
    registrar(`Se cerró un servidor que había quedado abierto (pid ${pid})`)
    await new Promise((r) => setTimeout(r, 3000))
  } catch {}
}

async function salir() {
  saliendo = true
  registrar('Apagando la app')
  await apagarServidor()
  apagarTunel()
  app.exit(0)
}

/* ---------------- IPC ---------------- */

ipcMain.handle('app-estado', () => {
  const config = leerConfig()
  return { configurada: !!config, cifrado: safeStorage.isEncryptionAvailable(), version: app.getVersion() }
})

let elegido = null // texto del archivo elegido, hasta guardarlo
ipcMain.handle('config-elegir', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Elegí el archivo de configuración del servidor',
    properties: ['openFile', 'showHiddenFiles'],
    filters: [{ name: 'Configuración', extensions: ['env', 'txt', '*'] }],
  })
  if (canceled || !filePaths[0]) return null
  return revisarArchivo(filePaths[0])
})

// El mismo archivo, pero arrastrado a la ventana.
ipcMain.handle('config-desde-ruta', (e, ruta) => revisarArchivo(ruta))

/** Lee y revisa un archivo de configuración. Al navegador solo vuelve el diagnóstico, nunca los valores. */
function revisarArchivo(ruta) {
  const mal = (error) => ({ ok: false, error, ruta: String(ruta || '') })
  let info
  try {
    info = fs.statSync(String(ruta || ''))
  } catch {
    return mal('No se encontró el archivo.')
  }
  if (!info.isFile()) return mal('Eso no es un archivo: arrastrá el .env.')
  if (info.size > 200 * 1024) return mal('El archivo es demasiado grande para ser un .env.')
  const texto = fs.readFileSync(ruta, 'utf8')
  const r = revisarConfig(texto)
  elegido = r.ok ? { ruta, texto } : null
  return { ok: r.ok, error: r.error, faltan: r.faltan, avisos: r.avisos, ruta, crm: r.config?.CRM_URL || null }
}

ipcMain.handle('config-guardar', async (e, { borrarOriginal } = {}) => {
  if (!elegido) return { ok: false, error: 'Primero elegí el archivo.' }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Windows no permite cifrar en esta cuenta de usuario.' }
  fs.mkdirSync(DATOS, { recursive: true })
  fs.writeFileSync(ARCHIVO_CONFIG, safeStorage.encryptString(elegido.texto))
  let borrado = false
  if (borrarOriginal) {
    try {
      fs.rmSync(elegido.ruta)
      borrado = true
    } catch {}
  }
  registrar(`Configuración guardada (cifrada)${borrado ? '; se borró el archivo original' : ''}`)
  elegido = null
  app.setLoginItemSettings({ openAtLogin: true, args: ['--oculto'] })
  if (iniciado) await reiniciarTodo()
  ventanaConfig?.close()
  setTimeout(abrirVentana, 500)
  actualizarIcono()
  return { ok: true, borrado }
})

ipcMain.handle('estado-linea', () => vistaEstado())
ipcMain.handle('validar-numero', (e, numero) => validarNumero(numero))
ipcMain.handle('iniciar-servidor', (e, opciones) => iniciarServidor(opciones))
ipcMain.handle('detener-servidor', () => detenerServidor())
ipcMain.on('abrir-whatsapp', abrirWhatsappWeb)
ipcMain.on('ocultar', () => ventana?.hide())
ipcMain.on('abrir-registros', abrirRegistros)
ipcMain.handle('registros', () => leerRegistros({ dirLogs: path.join(DATA_DIR, 'logs'), archivoApp: LOG_APP }))
ipcMain.on('copiar', (e, texto) => clipboard.writeText(String(texto ?? '')))
ipcMain.on('abrir-carpeta-registros', () => shell.openPath(fs.existsSync(path.join(DATA_DIR, 'logs')) ? path.join(DATA_DIR, 'logs') : DATOS))

/* ---------------- Arranque ---------------- */

app.on('second-instance', abrirVentana)
// La app sigue con el ícono aunque no haya ventanas abiertas.
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  app.setAppUserModelId('ar.neifert.whatsapp')
  registrar(`App iniciada (versión ${app.getVersion()})`)
  icono = new Tray(nativeImage.createFromPath(ICONO).resize({ width: 16, height: 16 }))
  icono.on('click', abrirVentana)
  actualizarIcono()

  if (!leerConfig()) {
    abrirConfig()
  } else {
    await cerrarHuerfano()
    // Al prender la PC (--oculto) arranca solo con el número guardado, si así quedó elegido:
    // después de un corte de luz el WhatsApp vuelve sin que nadie toque nada. Abriendo la
    // app a mano, o sin número guardado, se muestra la pantalla con "Iniciar servidor".
    const ajustes = leerAjustes()
    if (process.argv.includes('--oculto') && lineaGuardada() && ajustes.autoInicio !== false) {
      iniciado = true
      arrancarServidor()
      arrancarTunel()
    } else {
      abrirVentana()
    }
  }
  consultarEstado()
  programarConsulta()
  // Versiones nuevas del servidor: al minuto de arrancar y después cada 30 minutos.
  setTimeout(() => buscarYAvisar(), 60_000)
  setInterval(() => buscarYAvisar(), 30 * 60_000)
})

// Cerrar sesión o apagar Windows: se apaga el servidor ordenadamente antes de salir.
app.on('before-quit', (e) => {
  if (saliendo) return
  e.preventDefault()
  salir()
})
