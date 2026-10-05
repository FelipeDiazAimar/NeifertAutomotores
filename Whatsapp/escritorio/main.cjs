/*
 * App de escritorio de la PC que hace de servidor del WhatsApp de Neifert.
 *
 * Qué hace:
 *   - Corre el servidor de WhatsApp (Whatsapp/servidor) como proceso hijo, con el Node que
 *     trae la app, y lo vuelve a levantar si se cae.
 *   - Si la configuración trae WA_TUNEL_TOKEN, corre Cloudflare Tunnel (cloudflared) para
 *     que el CRM llegue a esta PC por https (wa.<dominio>).
 *   - Ícono junto al reloj con el estado de la línea; la ventana abre el panel en esta PC.
 *   - Arranca sola con Windows (oculta, solo el ícono).
 *
 * La configuración (el .env del servidor) se elige una vez desde un archivo y queda cifrada
 * con Windows (safeStorage/DPAPI) en %APPDATA%\Neifert WhatsApp. No viaja por internet.
 * Los datos de la línea (sesión, registros) quedan en %APPDATA%\Neifert WhatsApp\data.
 */
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, safeStorage, shell } = require('electron')
const { fork, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { parseEnv } = require('node:util')
const { credencialesR2, r2Get } = require('./r2.cjs')

// Datos en %APPDATA%Neifert WhatsApp (y no con el nombre interno del paquete).
app.setPath('userData', path.join(app.getPath('appData'), 'Neifert WhatsApp'))

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
  WHATSAPP_NUMERO: 'cualquier celular podría vincularse',
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
  }
}

function arrancarServidor() {
  if (servidor || saliendo) return
  const config = leerConfig()
  if (!config) return
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
  if (tunel || saliendo) return
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

/* ---------------- Estado (ícono) ---------------- */

const TEXTO_ESTADO = {
  conectado: 'Conectado',
  qr: 'Esperando que escaneen el QR',
  conectando: 'Conectando…',
  desconectado: 'Sin conexión',
  iniciando: 'Iniciando…',
}
let estado = { conexion: 'iniciando', ok: false }
let desconectadoDesde = null
let avisado = false

async function consultarSalud() {
  try {
    const r = await fetch(`${URL_PANEL}api/salud`, { signal: AbortSignal.timeout(5000) })
    estado = await r.json()
  } catch {
    estado = { conexion: servidor ? 'iniciando' : 'desconectado', ok: false }
  }
  if (estado.ok) {
    reintentos = 0
    desconectadoDesde = null
    avisado = false
  } else {
    desconectadoDesde ??= Date.now()
    // Aviso en Windows si la línea lleva 5 minutos sin conectar (las alertas por email las
    // manda el servidor).
    if (!avisado && Date.now() - desconectadoDesde > 5 * 60_000 && Notification.isSupported()) {
      avisado = true
      new Notification({ title: 'WhatsApp de Neifert sin conexión', body: `${TEXTO_ESTADO[estado.conexion] || estado.conexion}. Abrí la app para ver qué pasa.` }).show()
    }
  }
  actualizarIcono()
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
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Neifert WhatsApp',
    icon: ICONO,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  ventana.removeMenu()
  ventana.once('ready-to-show', () => ventana.show())
  // El servidor puede estar arrancando: se reintenta hasta que responda.
  ventana.webContents.on('did-fail-load', () => setTimeout(() => ventana?.loadURL(URL_PANEL), 2000))
  // Solo el panel local; los enlaces van al navegador.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  ventana.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(URL_PANEL)) e.preventDefault()
  })
  // Cerrar la ventana no apaga el servidor: queda el ícono junto al reloj.
  ventana.on('close', (e) => {
    if (saliendo) return
    e.preventDefault()
    ventana.hide()
  })
  ventana.on('closed', () => (ventana = null))
  ventana.loadURL(URL_PANEL)
}

function abrirConfig() {
  if (ventanaConfig) return ventanaConfig.focus()
  ventanaConfig = new BrowserWindow({
    width: 620,
    height: 640,
    resizable: false,
    title: 'Configuración — Neifert WhatsApp',
    icon: ICONO,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  ventanaConfig.removeMenu()
  ventanaConfig.on('closed', () => (ventanaConfig = null))
  ventanaConfig.loadFile(path.join(__dirname, 'ventana', 'config.html'))
}

/* Login con el usuario del CRM, para entrar al panel desde esta PC. */
let login = null // { ventana, resolver }

function pedirTokenCrm() {
  if (login) {
    login.ventana.focus()
    return login.promesa
  }
  let resolver
  const promesa = new Promise((r) => (resolver = r))
  const v = new BrowserWindow({
    width: 420,
    height: 460,
    resizable: false,
    parent: ventana || undefined,
    modal: !!ventana,
    title: 'Entrar — Neifert WhatsApp',
    icon: ICONO,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  v.removeMenu()
  login = { ventana: v, resolver, promesa }
  v.on('closed', () => {
    login?.resolver(null)
    login = null
  })
  v.loadFile(path.join(__dirname, 'ventana', 'login.html'))
  return promesa
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
      { label: 'Abrir WhatsApp', click: abrirVentana },
      { label: 'Reiniciar el servidor', enabled: !!leerConfig(), click: () => reiniciarTodo() },
      { label: buscando ? 'Buscando actualización…' : 'Buscar actualización ahora', enabled: ACTUALIZA && !buscando && !!leerConfig(), click: () => buscarYAvisar(true) },
      { label: 'Ver registros', click: () => shell.openPath(fs.existsSync(path.join(DATA_DIR, 'logs')) ? path.join(DATA_DIR, 'logs') : DATOS) },
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
  const ruta = filePaths[0]
  const texto = fs.readFileSync(ruta, 'utf8')
  const r = revisarConfig(texto)
  elegido = r.ok ? { ruta, texto } : null
  // Al navegador solo vuelve el diagnóstico, nunca los valores.
  return { ok: r.ok, error: r.error, faltan: r.faltan, avisos: r.avisos, ruta, numero: r.config?.WHATSAPP_NUMERO || null, crm: r.config?.CRM_URL || null }
})

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
  await reiniciarTodo()
  ventanaConfig?.close()
  setTimeout(abrirVentana, 1500)
  actualizarIcono()
  return { ok: true, borrado }
})

ipcMain.handle('login', async (e, usuario, clave) => {
  const config = leerConfig()
  if (!config) return { ok: false, error: 'La app no está configurada.' }
  const url = valor(config, OBLIGATORIAS[0]).replace(/\/+$/, '')
  const anon = valor(config, OBLIGATORIAS[1])
  // Mismo email sintético que usa el CRM (src/crm/lib/authEmail.js).
  const email = String(usuario || '').includes('@')
    ? String(usuario).trim()
    : `${String(usuario || '').toLowerCase().replace(/[^a-z0-9]/g, '')}@crm-viejo.neifert.local`
  try {
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: String(clave || '') }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.access_token) return { ok: false, error: r.status === 400 ? 'Usuario o contraseña incorrectos.' : `No se pudo entrar (${r.status}).` }
    login?.resolver(data.access_token)
    const v = login?.ventana
    login = null
    v?.close()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Sin conexión con el CRM: ${err.message}` }
  }
})

ipcMain.on('login-cancelar', () => login?.ventana.close())
ipcMain.handle('token-crm', () => pedirTokenCrm())

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
    arrancarServidor()
    arrancarTunel()
    if (!process.argv.includes('--oculto')) abrirVentana()
  }
  consultarSalud()
  setInterval(consultarSalud, 15_000)
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
