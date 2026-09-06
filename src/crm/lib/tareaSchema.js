import { z } from 'zod'

const textoOpc = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional())

export const tareaSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio'),
  descripcion: textoOpc,
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  hora: textoOpc,
  prioridad: z.enum(['baja', 'normal', 'alta']).default('normal'),
  asignado_a: textoOpc,
  cliente_id: textoOpc,
  vehiculo_id: textoOpc,
})
