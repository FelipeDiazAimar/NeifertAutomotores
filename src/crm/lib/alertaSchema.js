import { z } from 'zod'

const textoOpc = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional())

export const alertaSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio'),
  descripcion: textoOpc,
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  hora: z.string().min(1, 'La hora es obligatoria'),
  asignado_a: z.string().min(1, 'Elegí a quién se le asigna'),
  cliente_id: textoOpc,
  vehiculo_id: textoOpc,
})
