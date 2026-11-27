import UsuariosCrmSection from '@/components/admin/UsuariosCrmSection'
import RolesCrmSection from '@/components/admin/RolesCrmSection'
import AlmacenamientoSection from '@/components/admin/AlmacenamientoSection'
import RespaldosWhatsappSection from '@/components/admin/RespaldosWhatsappSection'

export default function AdminPage() {
  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl font-extrabold text-ink">Admin</h1>
      <section>
        <h2 className="mb-4 text-xl font-bold text-ink">Usuarios</h2>
        <UsuariosCrmSection />
      </section>
      <section>
        <h2 className="mb-4 text-xl font-bold text-ink">Roles</h2>
        <RolesCrmSection />
      </section>
      <section>
        <h2 className="mb-4 text-xl font-bold text-ink">Almacenamiento</h2>
        <AlmacenamientoSection />
      </section>
      <section>
        <h2 className="mb-4 text-xl font-bold text-ink">Respaldos de WhatsApp</h2>
        <RespaldosWhatsappSection />
      </section>
    </div>
  )
}
