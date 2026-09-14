/** Miniatura fija (portada o primera foto) del vehículo, para columnas de
 *  listas (VehiculoTable, PeritajesListPage, GestoriaListPage). No rota. */
export default function VehiculoThumb({ fotos }) {
  const portada = fotos?.find((f) => f.es_portada) ?? fotos?.[0]
  return (
    <div className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-neifert/5">
      {portada ? (
        <img src={portada.url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[9px] font-bold uppercase text-neifert/50">Sin foto</span>
      )}
    </div>
  )
}
