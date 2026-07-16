import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import Logo from '@/components/common/Logo'
import { InstagramIcon, FacebookIcon, WhatsAppIcon, XIcon } from '@/components/common/SocialIcons'
import { useSiteStore } from '@/store/useSiteStore'
import { waLink } from '@/lib/whatsapp'

const MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=Av.+Urquiza+898+San+Francisco+C%C3%B3rdoba+Argentina'

function FooterCol({ title, items }) {
  return (
    <div>
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-3">{title}</h4>
      <ul className="space-y-2">
        {items.map(({ label, href }) => {
          const legalRoutes = { Términos: '/terminos', Privacidad: '/privacidad', Cookies: '/cookies', Contacto: '/contacto' }
          const resolvedHref = title.toLowerCase() === 'legal' && legalRoutes[label] ? legalRoutes[label] : href
          return (
          <li key={label}>
            {resolvedHref.startsWith('/') ? (
              <Link to={resolvedHref} onClick={() => window.scrollTo({ top: 0, behavior: 'auto' })} className="text-sm text-ink-2 transition-colors hover:text-neifert">
                {label}
              </Link>
            ) : (
              <a href={resolvedHref} className="text-sm text-ink-2 transition-colors hover:text-neifert">
                {label}
              </a>
            )}
          </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function Footer() {
  const footer = useSiteStore((s) => s.footer)
  const socials = useSiteStore((s) => s.socials)
  const address = socials.address || 'Av. Urquiza 898, San Francisco, Córdoba'

  return (
    <footer className="mt-24 px-4 md:px-8">
      <div className="mx-auto max-w-7xl border-t border-line pt-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-ink-2">{footer.tagline}</p>
            <div className="mt-4 flex gap-3 text-ink-3">
              {socials.instagram && (
                <a
                  href={socials.instagram}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="transition-colors hover:text-neifert"
                >
                  <InstagramIcon size={18} />
                </a>
              )}
              {socials.facebook && (
                <a
                  href={socials.facebook}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="transition-colors hover:text-neifert"
                >
                  <FacebookIcon size={18} />
                </a>
              )}
              {socials.whatsappPhone && (
                <a
                  href={waLink(socials.whatsappPhone, 'Hola! Quería hacer una consulta.')}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                  className="transition-colors hover:text-whatsapp"
                >
                  <WhatsAppIcon size={18} />
                </a>
              )}
              {socials.x && (
                <a
                  href={socials.x}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="X"
                  className="transition-colors hover:text-neifert"
                >
                  <XIcon size={18} />
                </a>
              )}
            </div>
          </div>

          {footer.columns.map((col) => (
            <FooterCol key={col.title} title={col.title} items={col.items} />
          ))}

          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-3">
              Dónde estamos
            </h4>
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-2xl"
            >
              <iframe
                title="Neifert Automotores — Mapa"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3381.0!2d-62.0878!3d-31.4271!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sAv.+Urquiza+898%2C+San+Francisco%2C+C%C3%B3rdoba!5e0!3m2!1ses!2sar!4v1"
                width="100%"
                height="140"
                style={{ border: 0, display: 'block', pointerEvents: 'none' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </a>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-3">
              <MapPin size={13} className="mt-0.5 shrink-0 text-neifert" />
              {address}
            </p>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between pb-4">
          <p className="text-xs text-ink-3">{footer.copyright}</p>
          <Link
            to="/login"
            className="hidden text-xs text-ink-3 transition-colors hover:text-neifert md:block"
          >
            Acceso admin
          </Link>
        </div>
      </div>
    </footer>
  )
}
