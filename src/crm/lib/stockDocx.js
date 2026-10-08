import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  ImageRun,
  AlignmentType,
  WidthType,
  ShadingType,
  PageOrientation,
} from 'docx'

/** Columnas calcadas de la planilla en papel del salón. */
export const STOCK_HEADERS = [
  'MARCA',
  'MODELO',
  'VERSION',
  'AÑO',
  'KM',
  'CONTACTO DUEÑO',
  'CANJE CRÉDITO',
  'CONTADO EFECTIVO',
]

// Anchos por columna en DXA: la tabla Y cada celda los llevan (si no, Word
// y Google Docs rompen el layout). Suman el ancho útil de A4 VERTICAL con
// márgenes de 0.5" (11906 - 720 - 720 = 10466 DXA). Las columnas son
// angostas a propósito: el texto largo (versión, contacto) salta a 2+
// renglones dentro de la celda en vez de ensanchar la tabla.
const COLUMN_WIDTHS = [1100, 1300, 2400, 700, 1100, 1700, 1050, 1116]
const TABLE_WIDTH = COLUMN_WIDTHS.reduce((a, b) => a + b, 0)

// A4 vertical con márgenes angostos para que entren las 8 columnas.
const MARGENES = { top: 720, right: 720, bottom: 720, left: 720 }

// Ancho del logo en px (se mantiene proporción con el alto real del PNG).
export const LOGO_ANCHO_PX = 140

const HEADER_FILL = 'D9D9D9'
const FONT = 'Arial'
export const HEADER_SIZE = 22 // 11pt (docx usa medios puntos)
export const BODY_SIZE = 22 // 11pt

/** Miles estilo papel: 21000 → "21.000", 14100 → "14.100". Solo para KM. */
export function formatearMilesDoc(n) {
  if (n == null || n === '') return ''
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

/** Precios ÷1000 estilo papel: BD en pesos completos o USD directos.
 *  21000000 → "21.000", 20500000 → "20.500", 14100 → "14,1", 10000 → "10". */
export function formatearPrecioDoc(n) {
  if (n == null || n === '') return ''
  return (Number(n) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

/** Líneas de la celda CONTACTO DUEÑO: nombre + apellido y contacto abajo. */
export function contactoDuenio(v) {
  const nombre = [v.duenio_nombre, v.duenio_apellido].filter(Boolean).join(' ')
  return [nombre, v.duenio_contacto].filter(Boolean)
}

/** Una fila de la tabla como textos (contacto puede tener varias líneas).
 *  Devuelve null si el vehículo está dado de baja o es 0km (no van al papel). */
export function filaStock(v) {
  if (v.estado === 'baja' || v.es_0km) return null
  return [
    v.marca ?? '',
    v.modelo ?? '',
    v.version ?? '',
    v.anio != null ? String(v.anio) : '',
    formatearMilesDoc(v.km),
    contactoDuenio(v),
    formatearPrecioDoc(v.precio_canje),
    formatearPrecioDoc(v.precio_contado),
  ]
}

/** Orden de la planilla: marca A-Z, luego modelo A-Z (insensible a acentos). */
export function ordenarStock(filas) {
  const cmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'es', { sensitivity: 'base' })
  return [...filas].sort((a, b) => cmp(a.marca, b.marca) || cmp(a.modelo, b.modelo))
}

/** "viernes, 2 de octubre de 2026". Recibe Date (default: hoy). */
export function fechaEmision(date = new Date()) {
  const s = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function nombreArchivoStock(date = new Date()) {
  return `stock-neifert-${date.toISOString().slice(0, 10)}.docx`
}

function celda(texto, { header = false, width } = {}) {
  const lineas = Array.isArray(texto) ? texto : [texto]
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, fill: HEADER_FILL } : undefined,
    children: lineas.map(
      (l) =>
        new Paragraph({
          alignment: header ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: String(l), bold: header, font: FONT, size: header ? HEADER_SIZE : BODY_SIZE })],
        }),
    ),
  })
}

/** Genera el .docx del stock. `logoPng`: { data: ArrayBuffer, width, height }
 *  (opcional, se omite si no viene). Devuelve Blob listo para descargar. */
export async function generarStockDocx({ vehiculos = [], logoPng = null, fecha = new Date() } = {}) {
  const filas = ordenarStock(vehiculos).map(filaStock).filter(Boolean)

  const encabezado = new TableRow({
    children: STOCK_HEADERS.map((h, i) => celda(h, { header: true, width: COLUMN_WIDTHS[i] })),
  })
  const cuerpo = filas.map(
    (f) => new TableRow({ children: f.map((c, i) => celda(c, { width: COLUMN_WIDTHS[i] })) })
  )

  const children = []
  if (logoPng) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: 'png',
            data: logoPng.data,
            transformation: { width: logoPng.width, height: logoPng.height },
          }),
        ],
      })
    )
  }
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: 'Stock de vehículos — Neifert Automotores', bold: true, font: FONT, size: 32 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Fecha de emisión: ${fechaEmision(fecha)}`, font: FONT, size: 20 })],
    }),
    new Table({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: COLUMN_WIDTHS,
      rows: [encabezado, ...cuerpo],
    })
  )

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            // A4 vertical ( portrait ): las filas crecen en alto con
            // renglones múltiples en vez de ensanchar la tabla.
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: MARGENES,
          },
        },
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}
