/*
 * Diálogos de la app con su propio estilo (en vez de los de Windows): preguntas, avisos y
 * errores. Se usan dentro de una pantalla (nfDialogo.preguntar) o en la ventanita que abre
 * el proceso principal para lo que se pide desde el ícono junto al reloj (dialogo.html).
 */
;(() => {
  const ICONOS = {
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    aviso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  }

  const crear = (etiqueta, clase, texto) => {
    const el = document.createElement(etiqueta)
    if (clase) el.className = clase
    if (texto) el.textContent = texto
    return el
  }

  /**
   * Arma la tarjeta del diálogo. `opciones`: { tipo: info|aviso|error|ok, titulo, mensaje,
   * detalle, aceptar, cancelar (sin cancelar es un aviso con un solo botón), alternativa (un
   * tercer botón, a lo ancho, arriba de los otros), foco: aceptar|cancelar }.
   * `responder(true|false|'alternativa')` se llama con el botón elegido (Esc = cancelar).
   */
  function armar(opciones, responder) {
    const { tipo = 'info', titulo = '', mensaje = '', detalle = '', aceptar = 'Aceptar', cancelar = null, alternativa = null, foco = 'aceptar' } = opciones || {}
    const tarjeta = crear('div', 'dialogo')
    tarjeta.setAttribute('role', cancelar ? 'alertdialog' : 'dialog')
    tarjeta.setAttribute('aria-modal', 'true')

    const cabeza = crear('div', 'dialogo-cabeza')
    const icono = crear('div', `dialogo-icono ${ICONOS[tipo] ? tipo : 'info'}`)
    icono.innerHTML = ICONOS[tipo] || ICONOS.info
    const textos = crear('div', 'dialogo-textos')
    if (titulo) textos.append(crear('h2', '', titulo))
    if (mensaje) textos.append(crear('p', '', mensaje))
    cabeza.append(icono, textos)
    tarjeta.append(cabeza)
    if (detalle) tarjeta.append(crear('div', 'dialogo-detalle', detalle))

    if (alternativa) {
      const fila = crear('div', 'acciones dialogo-alternativa')
      const btn = crear('button', 'btn peligro', alternativa)
      btn.type = 'button'
      btn.addEventListener('click', () => responder('alternativa'))
      fila.append(btn)
      tarjeta.append(fila)
    }

    const acciones = crear('div', 'acciones')
    const btnAceptar = crear('button', 'btn primario', aceptar)
    btnAceptar.type = 'button'
    btnAceptar.addEventListener('click', () => responder(true))
    let btnCancelar = null
    if (cancelar) {
      btnCancelar = crear('button', 'btn secundario', cancelar)
      btnCancelar.type = 'button'
      btnCancelar.addEventListener('click', () => responder(false))
      acciones.append(btnCancelar)
    }
    acciones.append(btnAceptar)
    tarjeta.append(acciones)

    tarjeta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        responder(!cancelar)
      }
      // El foco no se escapa del diálogo con Tab.
      if (e.key === 'Tab') {
        const botones = [...tarjeta.querySelectorAll('button')]
        const i = botones.indexOf(document.activeElement)
        e.preventDefault()
        botones[(i + (e.shiftKey ? -1 : 1) + botones.length) % botones.length].focus()
      }
    })
    tarjeta.enfocar = () => (foco === 'cancelar' && btnCancelar ? btnCancelar : btnAceptar).focus()
    return tarjeta
  }

  /** Muestra el diálogo sobre la pantalla actual. Devuelve una promesa: true si se aceptó. */
  function preguntar(opciones) {
    return new Promise((resolve) => {
      const previo = document.activeElement
      const velo = crear('div', 'velo')
      let listo = false
      const responder = (acepta) => {
        if (listo) return
        listo = true
        velo.classList.add('saliendo')
        setTimeout(() => velo.remove(), 120)
        previo?.focus?.()
        resolve(acepta)
      }
      const tarjeta = armar(opciones, responder)
      velo.append(tarjeta)
      // Tocar afuera es como cancelar (solo si hay algo que cancelar).
      velo.addEventListener('mousedown', (e) => {
        if (e.target === velo && opciones?.cancelar) responder(false)
      })
      document.body.append(velo)
      tarjeta.enfocar()
    })
  }

  window.nfDialogo = { armar, preguntar }
})()
