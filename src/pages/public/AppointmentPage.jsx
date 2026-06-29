import { useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Clock, User, Phone, Calendar, Car, Mail, ExternalLink } from 'lucide-react'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import Input from '@/components/common/Input'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import { useSiteStore } from '@/store/useSiteStore'
import { waLink } from '@/lib/whatsapp'
import { fadeUp, staggerContainer } from '@/lib/animations'

const MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=Av.+Urquiza+898+San+Francisco+C%C3%B3rdoba+Argentina'

export default function AppointmentPage() {
  const socials = useSiteStore((s) => s.socials)
  const [form, setForm] = useState({ name: '', phone: '', when: '', vehicle: '', notes: '' })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const buildMessage = () => {
    const lines = ['Hola! Quería coordinar una cita en Neifert Automotores.', '']
    if (form.name)    lines.push(`👤 Nombre: ${form.name}`)
    if (form.phone)   lines.push(`📞 Teléfono: ${form.phone}`)
    if (form.when)    lines.push(`🗓️ Preferencia: ${form.when}`)
    if (form.vehicle) lines.push(`🚗 Vehículo de interés: ${form.vehicle}`)
    if (form.notes)   lines.push('', form.notes)
    return lines.join('\n')
  }

  const onSubmit = (e) => {
    e.preventDefault()
    window.open(waLink(socials.whatsappPhone, buildMessage()), '_blank', 'noopener')
  }

  const address  = socials.address  || 'Av. Urquiza 898, San Francisco, Córdoba'
  const hours    = socials.hours    || 'Lun a Vie · 8 a 12:30 h y 16 a 20 h · Sáb 9 a 13 h'
  const email    = socials.email    || 'neifertsanfrancisco@gmail.com'
  const phone    = socials.phone    || '(03564) 43-5199'

  return (
    <section className="mx-auto max-w-5xl px-4 py-12 md:px-8">
      {/* Encabezado */}
      <motion.div
        variants={staggerContainer(0.1, 0.05)}
        initial="hidden"
        animate="show"
        className="text-center"
      >
        <motion.span
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full bg-whatsapp/15 px-4 py-1.5 text-xs font-semibold tracking-wide text-whatsapp"
        >
          <WhatsAppIcon size={14} /> Coordiná por WhatsApp
        </motion.span>
        <motion.h1
          variants={fadeUp}
          className="mt-5 font-display text-4xl font-extrabold leading-tight text-ink md:text-5xl"
        >
          Reservá tu <em className="not-italic text-neifert">cita</em> en el salón
        </motion.h1>
        <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-xl text-ink-2 md:text-lg">
          Completá los datos y te contactanos. También podés
          escribirnos directamente o visitarnos en San Francisco, Córdoba.
        </motion.p>
      </motion.div>

      <div className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        {/* Formulario */}
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <GlassCard className="p-6 md:p-8">
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              <Input label="Nombre" icon={User} value={form.name} onChange={set('name')} placeholder="Tu nombre" />
              <Input label="Teléfono" icon={Phone} value={form.phone} onChange={set('phone')} placeholder="Tu número" />
              <Input label="Día y horario" icon={Calendar} value={form.when} onChange={set('when')} placeholder="Ej: sábado a la mañana" />
              <Input label="Vehículo de interés" icon={Car} value={form.vehicle} onChange={set('vehicle')} placeholder="Marca y modelo" />
              <div className="sm:col-span-2">
                <Input
                  as="textarea"
                  label="Mensaje (opcional)"
                  value={form.notes}
                  onChange={set('notes')}
                  placeholder="Contanos qué estás buscando…"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="whatsapp" size="lg" icon={WhatsAppIcon} className="w-full">
                  Coordinar por WhatsApp
                </Button>
              </div>
            </form>
          </GlassCard>
        </motion.div>

        {/* Info de contacto */}
        <motion.div initial="hidden" animate="show" variants={fadeUp} className="space-y-4">
          {/* Ubicación y horario */}
          <GlassCard className="p-6">
            <h3 className="font-display text-lg font-bold text-ink">El salón</h3>
            <ul className="mt-4 space-y-4 text-sm text-ink-2">
              <li className="flex items-start gap-3">
                <MapPin size={18} className="mt-0.5 shrink-0 text-neifert" />
                <div>
                  <p className="font-medium text-ink">{address}</p>
                  <a
                    href={MAPS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-neifert hover:underline"
                  >
                    Ver en Google Maps <ExternalLink size={11} />
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Clock size={18} className="mt-0.5 shrink-0 text-neifert" />
                <div>
                  <p className="font-medium text-ink">Horario de atención</p>
                  <p className="mt-0.5 text-ink-3">Lun a Vie · 8 a 12:30 h y 16 a 20 h</p>
                  <p className="text-ink-3">Sáb · 9 a 13 h</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Phone size={18} className="mt-0.5 shrink-0 text-neifert" />
                <div>
                  <a
                    href={`tel:${phone.replace(/\D/g, '')}`}
                    className="font-medium text-ink transition-colors hover:text-neifert"
                  >
                    {phone}
                  </a>
                  <p className="mt-0.5 text-xs text-ink-3">Llamadas y consultas</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail size={18} className="mt-0.5 shrink-0 text-neifert" />
                <div>
                  <a
                    href={`mailto:${email}`}
                    className="font-medium text-ink hover:text-neifert transition-colors"
                  >
                    {email}
                  </a>
                  <p className="mt-0.5 text-xs text-ink-3">Consultas por correo</p>
                </div>
              </li>
            </ul>
          </GlassCard>

          {/* WhatsApp directo */}
          <a
            href={waLink(socials.whatsappPhone, 'Hola! Quería hacer una consulta.')}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            <GlassCard className="flex items-center gap-3 p-5 transition-colors hover:border-whatsapp">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-whatsapp text-white">
                <WhatsAppIcon size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">Escribinos ahora</p>
                <p className="text-xs text-ink-3">Respondemos a la brevedad</p>
              </div>
            </GlassCard>
          </a>

        </motion.div>
      </div>
    </section>
  )
}
