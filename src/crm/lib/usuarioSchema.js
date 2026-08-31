import { z } from 'zod'

export const crearUsuarioSchema = z.object({
  usuario: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  nombre: z.string().trim().min(2, 'Ingresá el nombre'),
  rol: z.enum(['admin', 'dueno', 'vendedor']),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    repetir: z.string(),
  })
  .refine((d) => d.password === d.repetir, { path: ['repetir'], message: 'No coincide' })
