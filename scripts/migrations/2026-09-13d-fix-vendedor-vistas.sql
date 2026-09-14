-- La migración 2026-09-13-unificacion-admin-crm.sql agregó 'leads', 'contenido',
-- 'estadisticas' y 'admin' a vistas_default de TODOS los roles (le faltaba un
-- WHERE rol IN (...)), incluido 'vendedor' — por eso un vendedor podía
-- entrar directo a /admin/admin (gestión de usuarios/roles) por URL.
-- Vendedor vuelve a un alcance operativo: sin Carga Leads, Administración
-- Contenido Web, Estadísticas ni Admin. 'dueno' y 'admin' no se tocan.
update crm.roles
set vistas_default = array(
  select v from unnest(vistas_default) as v
  where v not in ('leads', 'contenido', 'estadisticas', 'admin')
)
where rol = 'vendedor';
