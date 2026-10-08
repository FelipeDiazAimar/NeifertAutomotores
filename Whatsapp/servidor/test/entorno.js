/*
 * Entorno aislado para los tests: datos en una carpeta temporal, mensajes en archivos
 * locales, sin R2 ni base, y un CRM de mentira (las llamadas a fetch se simulan). Se importa
 * PRIMERO en cada test, antes que cualquier módulo de src/: config.js lee el entorno al
 * cargarse y nunca pisa lo que ya está definido.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DIR_PRUEBA = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-wa-test-'))

Object.assign(process.env, {
  DATA_DIR: DIR_PRUEBA,
  ALMACEN: 'local',
  WA_DATABASE_URL: '',
  WA_SUPABASE_URL: '',
  WA_R2_BUCKET: '',
  WA_BACKUP_CLAVE: '',
  WA_ALERTA_EMAIL: '',
  WA_ALERTA_WEBHOOK: '',
  SUPABASE_URL: 'https://crm-de-prueba.supabase.co',
  SUPABASE_ANON_KEY: 'anon-de-prueba',
  SUPABASE_SERVICE_ROLE_KEY: 'servicio-de-prueba',
  SESION_SECRETO: 'secreto-de-prueba',
  WHATSAPP_ROLES: 'admin,dueno,vendedor',
  WHATSAPP_ROLES_LINEA: 'admin,dueno',
  WHATSAPP_ROLES_LECTURA: 'lectura',
  WHATSAPP_NUMERO: '',
  WA_CONSERVAR_ELIMINADOS: '',
  WA_CONSERVAR_EDICIONES: '',
})

process.on('exit', () => fs.rmSync(DIR_PRUEBA, { recursive: true, force: true }))
