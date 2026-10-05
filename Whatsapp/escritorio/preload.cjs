/*
 * Puente entre las pantallas de la app (archivos locales: configuración y estado) y el
 * proceso principal. Solo pasan diagnósticos y el estado de la línea, nunca las claves.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron')

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('nfApp', {
    // Configuración: elegirla con el diálogo o arrastrar el archivo a la ventana
    estado: () => ipcRenderer.invoke('app-estado'),
    elegirConfig: () => ipcRenderer.invoke('config-elegir'),
    configDesdeArchivo: (archivo) => ipcRenderer.invoke('config-desde-ruta', webUtils.getPathForFile(archivo)),
    guardarConfig: (opciones) => ipcRenderer.invoke('config-guardar', opciones),
    // Estado de la línea (QR, número conectado)
    estadoLinea: () => ipcRenderer.invoke('estado-linea'),
    alCambiarEstado: (fn) => ipcRenderer.on('estado', (_e, estado) => fn(estado)),
    abrirWhatsapp: () => ipcRenderer.send('abrir-whatsapp'),
    // Número de la línea y arranque del servidor
    validarNumero: (numero) => ipcRenderer.invoke('validar-numero', numero),
    iniciarServidor: (opciones) => ipcRenderer.invoke('iniciar-servidor', opciones),
    detenerServidor: () => ipcRenderer.invoke('detener-servidor'),
    ocultar: () => ipcRenderer.send('ocultar'),
    // Registros del servidor, la app y el túnel
    abrirRegistros: () => ipcRenderer.send('abrir-registros'),
    registros: () => ipcRenderer.invoke('registros'),
    copiar: (texto) => ipcRenderer.send('copiar', texto),
    abrirCarpetaRegistros: () => ipcRenderer.send('abrir-carpeta-registros'),
  })
}
