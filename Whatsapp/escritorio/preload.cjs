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
    // Ajustes: inicio con la PC, configuración, respaldo, actualización y apagado
    ajustes: () => ipcRenderer.invoke('ajustes'),
    alCambiarAjustes: (fn) => ipcRenderer.on('ajustes', (_e, ajustes) => fn(ajustes)),
    alPedirAjustes: (fn) => ipcRenderer.on('ver-ajustes', () => fn()),
    ponerInicioConLaPc: (si) => ipcRenderer.invoke('ajuste-inicio-pc', !!si),
    ponerTema: (tema) => ipcRenderer.invoke('ajuste-tema', tema),
    abrirConfig: () => ipcRenderer.send('abrir-config'),
    restaurarSesion: () => ipcRenderer.invoke('restaurar-sesion'),
    buscarActualizacion: () => ipcRenderer.invoke('buscar-actualizacion'),
    reiniciarServidor: () => ipcRenderer.invoke('reiniciar-servidor'),
    apagarYSalir: () => ipcRenderer.send('apagar-y-salir'),
    // Diálogos propios: los que pide el proceso principal adentro de esta ventana…
    alPedirDialogo: (fn) => ipcRenderer.on('dialogo', (_e, id, opciones) => fn(id, opciones)),
    responderDialogoEnVentana: (id, acepta) => ipcRenderer.send('dialogo-en-ventana', id, !!acepta),
    // …y la ventanita suelta (dialogo.html)
    dialogo: () => ipcRenderer.invoke('dialogo-opciones'),
    dialogoListo: (alto) => ipcRenderer.send('dialogo-listo', alto),
    dialogoResponder: (acepta) => ipcRenderer.send('dialogo-respuesta', !!acepta),
  })
}
