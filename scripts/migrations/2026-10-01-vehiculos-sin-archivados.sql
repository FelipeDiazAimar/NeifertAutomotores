-- Vehículos: se elimina el concepto de "archivado".
-- Los archivados pasan a estado='baja' para que sigan visibles en /crm/vehiculos
-- con el filtro de Estado, y se limpia archivado_en.
-- La columna se conserva (clientes/tareas la siguen usando) pero el código
-- de vehículos ya no la filtra.
update crm.vehiculos
set estado = 'baja',
    archivado_en = null,
    actualizado_en = now()
where archivado_en is not null;
