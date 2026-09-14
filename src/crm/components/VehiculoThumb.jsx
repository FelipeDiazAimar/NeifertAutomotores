import { useState } from 'react'

/** Miniatura fija (portada o primera foto) del vehículo, para columnas de
 *  listas (VehiculoTable, PeritajesListPage, GestoriaListPage). No rota. */
export default function VehiculoThumb({ fotos }) {
  const portada = fotos?.find((f) => f.es_portada) ?? fotos?.[0]
  const [rota, setRota] = useState(false)
  return (
    <div className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-neifert/5">
      {portada && !rota ? (
        <img
          src={portada.url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            console.error('[VehiculoThumb] no se pudo cargar la foto', portada.id, portada.url)
            setRota(true)
          }}
        />
      ) : (
        <span className="text-[9px] font-bold uppercase text-neifert/50">Sin foto</span>
      )}
    </div>
  )
}
