/*
 * Puente entre las pantallas de la app (archivos locales: configuración y estado) y el
 * proceso principal. Solo pasan diagnósticos y el estado de la línea, nunca las claves.
 */
const { contextBridge, ipcRenderer } = require('electron')

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('nfApp', {
    // Configuración
    estado: () => ipcRenderer.invoke('app-estado'),
    elegirConfig: () => ipcRenderer.invoke('config-elegir'),
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
  })
}
