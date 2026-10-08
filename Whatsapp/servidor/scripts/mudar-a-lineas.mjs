/*
 * Una sola vez, al pasar a "datos por línea" (supabase/whatsapp_v4_lineas.sql): mueve lo que
 * había en la raíz del bucket de R2 (media/, miniaturas/, fotos/, respaldo/) a
 * lineas/<WHATSAPP_NUMERO>/, que es donde ahora lo busca el servidor.
 *
 *   npm run mudar-a-lineas            (con el servidor apagado)
 *
 * Copia todo, verifica que cada copia tenga el mismo tamaño y recién ahí borra los
 * originales (ver moverCrudo en src/archivos.js). Si se corta, se puede volver a correr.
 * app/ (las actualizaciones del servidor) es común a todas las líneas y no se toca.
 */
const { ARCHIVOS_EN_R2, CLAVE_LINEA, LINEA } = await import('../src/config.js')
const { moverCrudo } = await import('../src/archivos.js')

if (!ARCHIVOS_EN_R2) {
  console.log('R2 no está configurado: no hay nada que mover.')
  process.exit(0)
}
if (!LINEA) {
  console.error('Definí WHATSAPP_NUMERO (la línea a la que pertenecen los archivos que ya están en R2).')
  process.exit(1)
}

for (const carpeta of ['media', 'miniaturas', 'fotos', 'respaldo']) {
  const destino = `lineas/${CLAVE_LINEA}/${carpeta}`
  process.stdout.write(`${carpeta}/ → ${destino}/ … `)
  try {
    await moverCrudo(carpeta, destino)
    console.log('listo')
  } catch (err) {
    console.log(`ERROR: ${err.message}`)
    process.exitCode = 1
  }
}
