import { z } from 'zod'

const ANIO_MAX = new Date().getFullYear() + 1

const numOpc = (min) =>
  z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Número inválido' }).min(min, `Debe ser ≥ ${min}`).optional(),
  )
const textoOpc = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional())

export const clienteSchema = z.object({
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
})
