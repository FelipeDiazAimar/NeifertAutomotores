import { Mail, MapPin, Phone, ExternalLink } from 'lucide-react'
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '@/components/common/SocialIcons'
import GlassCard from '@/components/common/GlassCard'
import { useSiteStore } from '@/store/useSiteStore'
import { waLink } from '@/lib/whatsapp'

const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=Av.+Urquiza+898+San+Francisco+C%C3%B3rdoba+Argentina'

export default function ContactPage() {
  const socials = useSiteStore((s) => s.socials)
  const phone = socials.phone || '(03564) 43-5199'
  const email = socials.email || 'neifertsanfrancisco@gmail.com'
  const address = socials.address || 'Av. Urquiza 898, San Francisco, Córdoba'
  const contacts = [
    { label: 'WhatsApp', detail: '+54 3564 562413', href: waLink(socials.whatsappPhone, 'Hola! Quería hacer una consulta.'), icon: WhatsAppIcon, external: true, color: 'text-whatsapp' },
    { label: 'Teléfono', detail: phone, href: `tel:${phone.replace(/\D/g, '')}`, icon: Phone, color: 'text-neifert' },
    { label: 'Correo electrónico', detail: email, href: `mailto:${email}`, icon: Mail, color: 'text-neifert' },
    { label: 'Instagram', detail: '@neifertautomotores', href: socials.instagram, icon: InstagramIcon, external: true, color: 'text-neifert' },
    { label: 'Facebook', detail: 'Neifert Automotores', href: socials.facebook, icon: FacebookIcon, external: true, color: 'text-neifert' },
  ].filter((item) => item.href)

  return <section className="mx-auto max-w-4xl px-4 py-14 md:px-8">
    <h1 className="font-display text-4xl font-extrabold text-ink md:text-5xl">Estamos para <em className="not-italic text-neifert">ayudarte</em></h1>
    <p className="mt-4 max-w-2xl text-lg text-ink-2">Elegí el medio que prefieras para consultar por un vehículo, coordinar una visita o conocernos mejor.</p>
    <div className="mt-10 grid gap-4 sm:grid-cols-2">
      {contacts.map(({ label, detail, href, icon: Icon, external, color }) => <a key={label} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}><GlassCard className="flex items-center gap-4 p-5 transition-colors hover:border-neifert"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface ${color}`}><Icon size={21} /></span><span><span className="block text-sm font-semibold text-ink">{label}</span><span className="mt-0.5 block text-sm text-ink-3">{detail}</span></span></GlassCard></a>)}
    </div>
    <GlassCard className="mt-4 flex items-start gap-4 p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neifert/10 text-neifert"><MapPin size={21} /></span><div><p className="font-semibold text-ink">Visitá nuestro salón</p><p className="mt-0.5 text-sm text-ink-3">{address}</p><a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-neifert hover:underline">Abrir en Google Maps <ExternalLink size={14} /></a></div></GlassCard>
  </section>
}
