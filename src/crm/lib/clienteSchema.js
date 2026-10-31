import { z } from 'zod'

const ANIO_MAX = new Date().getFullYear() + 1

const numOpc = (min) =>
  z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Número inválido' }).min(min, `Debe ser ≥ ${min}`).optional(),
  )
const textoOpc = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional())

export const clienteSchema = z
  .object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  telefono: textoOpc,
  localidad: textoOpc,
  fecha_cumple: textoOpc,
  canal: textoOpc,
  presupuesto: numOpc(0),
  marca_interes: textoOpc,
  modelo_interes: textoOpc,
  tipo_interes: textoOpc,
  trans_interes: textoOpc,
  anio_min: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number().int().min(1950, 'Año inválido').max(ANIO_MAX, 'Año inválido').optional(),
  ),
  anio_max: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number().int().min(1950, 'Año inválido').max(ANIO_MAX, 'Año inválido').optional(),
  ),
  notas: textoOpc,
  interes_cero_km: z.boolean().optional(),
  // Tarea / alerta opcionales que se crean junto con el cliente (solo en el alta).
  tarea_titulo: textoOpc,
  tarea_fecha: textoOpc,
  tarea_hora: textoOpc,
  tarea_prioridad: textoOpc,
  alerta_titulo: textoOpc,
  alerta_fecha: textoOpc,
  alerta_hora: textoOpc,
  })
  .superRefine((d, ctx) => {
    const falta = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (d.tarea_titulo && !d.tarea_fecha) falta('tarea_fecha', 'Elegí la fecha de la tarea')
    if (d.alerta_titulo) {
      if (!d.alerta_fecha) falta('alerta_fecha', 'Elegí la fecha de la alerta')
      if (!d.alerta_hora) falta('alerta_hora', 'Elegí la hora de la alerta')
    }
  })
