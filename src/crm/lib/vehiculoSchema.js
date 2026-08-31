import { z } from 'zod'

const ANIO_MAX = new Date().getFullYear() + 1

// '' | null | undefined → undefined; resto → Number
const numOpc = (min) =>
  z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Número inválido' }).min(min, `Debe ser ≥ ${min}`).optional(),
  )

const textoOpc = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional())

export const vehiculoSchema = z.object({
  marca: z.string().trim().min(1, 'La marca es obligatoria'),
  modelo: z.string().trim().min(1, 'El modelo es obligatorio'),
  version: textoOpc,
  patente: textoOpc,
  tipo: textoOpc,
  anio: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number().int().min(1950, 'Año inválido').max(ANIO_MAX, 'Año inválido').optional(),
  ),
  km: numOpc(0),
  transmision: textoOpc,
  color: textoOpc,
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  precio_contado: numOpc(0),
  precio_canje: numOpc(0),
  duenio_nombre: textoOpc,
  duenio_apellido: textoOpc,
  duenio_contacto: textoOpc,
  itv: textoOpc,
  itv_venc: textoOpc,
  consignacion: z.boolean().optional(),
  tipo_consignacion: textoOpc,
  origen: textoOpc,
  carpeta_completa: z.boolean().optional(),
  carpeta_con_oficio: z.boolean().optional(),
  carpeta_entregada: z.boolean().optional(),
  tiene_iva: z.boolean().optional(),
  nota: textoOpc,
})
