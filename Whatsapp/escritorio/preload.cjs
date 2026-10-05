/*
 * Puente entre las páginas y la app. El panel (servido por el servidor local) solo puede
 * pedir la sesión del CRM; las pantallas propias de la app (archivos locales) además
 * eligen la configuración y hacen el login.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nfEscritorio', {
  tokenCrm: () => ipcRenderer.invoke('token-crm'),
})

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('nfApp', {
    estado: () => ipcRenderer.invoke('app-estado'),
    elegirConfig: () => ipcRenderer.invoke('config-elegir'),
    guardarConfig: (opciones) => ipcRenderer.invoke('config-guardar', opciones),
    login: (usuario, clave) => ipcRenderer.invoke('login', usuario, clave),
    cancelarLogin: () => ipcRenderer.send('login-cancelar'),
  })
}
