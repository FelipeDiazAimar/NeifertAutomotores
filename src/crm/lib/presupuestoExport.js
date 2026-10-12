import { toPng, toBlob } from 'html-to-image'
import { jsPDF } from 'jspdf'

function dimensionesDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })
}

function descargar(href, nombre) {
  const a = document.createElement('a')
  a.href = href
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** PNG en alta resolución del nodo del presupuesto (1080px de base → x2). */
export async function exportarPresupuestoPNG(nodo, nombre = 'presupuesto.png') {
  if (!nodo) throw new Error('Nada para exportar')
  const dataUrl = await toPng(nodo, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#06070b',
  })
  descargar(dataUrl, nombre)
  return dataUrl
}

/** PDF del mismo tamaño que la imagen generada (sin bandas blancas). */
export async function exportarPresupuestoPDF(nodo, nombre = 'presupuesto.pdf') {
  if (!nodo) throw new Error('Nada para exportar')
  const dataUrl = await toPng(nodo, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#06070b',
  })
  const { w, h } = await dimensionesDataUrl(dataUrl)
  const pdf = new jsPDF({
    orientation: h >= w ? 'portrait' : 'landscape',
    unit: 'px',
    format: [w, h],
    hotfix: ['px_scaling'],
  })
  pdf.addImage(dataUrl, 'PNG', 0, 0, w, h)
  pdf.save(nombre)
  return dataUrl
}

/** Copia la imagen del presupuesto al portapapeles (para pegar en WhatsApp). */
export async function copiarPresupuestoImagen(nodo) {
  if (!nodo) throw new Error('Nada para copiar')
  const blob = await toBlob(nodo, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#06070b',
  })
  if (!blob) throw new Error('No se pudo generar la imagen')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  return blob
}
