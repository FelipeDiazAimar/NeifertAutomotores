import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, RotateCcw, Video, Quote, Image as ImageIcon, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react'
import Button from '@/components/common/Button'
import ImageUploader from '@/components/admin/ImageUploader'
import VideoUploader from '@/components/admin/VideoUploader'
import { TextField, Section, inputCls } from '@/components/admin/ContentFields'
import { useSiteStore } from '@/store/useSiteStore'
import { syncInstagramFeed } from '@/services/instagramSync.service'
import { cn } from '@/lib/cn'

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'categorias', label: 'Catálogo' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'footer', label: 'Footer' },
  { id: 'redes', label: 'Redes & Contacto' },
]

/** Lista simple de texto (sin id separado del valor): agregar/borrar. Usada
 *  para tipos de combustible y de caja — a diferencia de las categorías, acá
 *  el texto mostrado ES el dato que se guarda en cada vehículo, así que no
 *  hay edición en el lugar (evita dejar autos con un valor "huérfano"). */
function SimpleListEditor({ title, desc, placeholder, items, onAdd, onRemove }) {
  const [value, setValue] = useState('')

  const add = () => {
    const v = value.trim()
    if (!v) return
    onAdd(v)
    setValue('')
  }

  return (
    <Section title={title} desc={desc}>
      <div className="mb-4 flex gap-2">
        <input
          className={inputCls}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
        />
        <Button size="sm" variant="glass" icon={Plus} onClick={add}>
          Agregar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="glass flex items-center gap-2 rounded-full py-1.5 pl-3 pr-2 text-sm text-ink"
          >
            {item}
            <button
              onClick={() => onRemove(item)}
              className="text-ink-3 transition-colors hover:text-neifert"
              aria-label={`Borrar ${item}`}
            >
              <Trash2 size={13} />
            </button>
          </span>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-3">Vacío. Agregá uno arriba.</p>}
      </div>
    </Section>
  )
}

/* ---------------------- CATÁLOGO (categorías + combustible + caja) ---------------------- */
function CatalogTab() {
  const categories = useSiteStore((s) => s.categories)
  const addCategory = useSiteStore((s) => s.addCategory)
  const updateCategory = useSiteStore((s) => s.updateCategory)
  const removeCategory = useSiteStore((s) => s.removeCategory)
  const [newLabel, setNewLabel] = useState('')

  const fuelTypes = useSiteStore((s) => s.fuelTypes)
  const addFuelType = useSiteStore((s) => s.addFuelType)
  const removeFuelType = useSiteStore((s) => s.removeFuelType)

  const transmissions = useSiteStore((s) => s.transmissions)
  const addTransmission = useSiteStore((s) => s.addTransmission)
  const removeTransmission = useSiteStore((s) => s.removeTransmission)

  const add = () => {
    const label = newLabel.trim()
    if (!label) return
    addCategory(label)
    setNewLabel('')
  }

  return (
    <div className="space-y-5">
      <Section
        title="Categorías de vehículos"
        desc="Se usan en los chips del catálogo y al elegir la categoría de cada vehículo. Reemplazan a las de ejemplo."
      >
        <div className="mb-4 flex gap-2">
          <input
            className={inputCls}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder="Nueva categoría (ej: Deportivo, Familiar…)"
          />
          <Button size="sm" variant="glass" icon={Plus} onClick={add}>
            Agregar
          </Button>
        </div>

        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                className={inputCls}
                value={c.label}
                onChange={(e) => updateCategory(c.id, e.target.value)}
              />
              <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 sm:inline">
                {c.id}
              </span>
              <button
                onClick={() => removeCategory(c.id)}
                className="shrink-0 text-ink-3 transition-colors hover:text-neifert"
                aria-label="Borrar categoría"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-ink-3">No hay categorías. Agregá una arriba.</p>
          )}
        </div>
      </Section>

      <SimpleListEditor
        title="Tipos de combustible"
        desc="Opciones del select de combustible al cargar/editar un vehículo."
        placeholder="Nuevo tipo (ej: GNC)"
        items={fuelTypes}
        onAdd={addFuelType}
        onRemove={removeFuelType}
      />

      <SimpleListEditor
        title="Tipos de caja"
        desc="Opciones del select de transmisión al cargar/editar un vehículo."
        placeholder="Nuevo tipo (ej: CVT)"
        items={transmissions}
        onAdd={addTransmission}
        onRemove={removeTransmission}
      />
    </div>
  )
}

/* ------------------------------- HOME -------------------------------- */
function HomeTab() {
  const home = useSiteStore((s) => s.home)
  const setHome = useSiteStore((s) => s.setHome)
  const stories = useSiteStore((s) => s.stories)
  const addStory = useSiteStore((s) => s.addStory)
  const updateStory = useSiteStore((s) => s.updateStory)
  const removeStory = useSiteStore((s) => s.removeStory)
  const heroSlides = useSiteStore((s) => s.heroSlides)
  const addHeroSlide = useSiteStore((s) => s.addHeroSlide)
  const updateHeroSlide = useSiteStore((s) => s.updateHeroSlide)
  const removeHeroSlide = useSiteStore((s) => s.removeHeroSlide)
  const reorderHeroSlide = useSiteStore((s) => s.reorderHeroSlide)

  return (
    <div className="space-y-5">
      <Section
        title="Carrusel del hero"
        desc="Imágenes que rotan solas arriba de todo en la home, con su propio texto centrado. Se reproduce en automático; si el visitante lo desliza, se pausa 1 minuto."
        action={
          <Button
            size="sm"
            variant="glass"
            icon={Plus}
            onClick={() => addHeroSlide({ title: '', subtitle: '', image: '' })}
          >
            Agregar imagen
          </Button>
        }
      >
        <div className="space-y-3">
          {heroSlides.map((slide, i) => (
            <div key={slide.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neifert">
                  Imagen {i + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => reorderHeroSlide(slide.id, -1)}
                    disabled={i === 0}
                    className="text-ink-3 transition-colors hover:text-neifert disabled:opacity-30"
                    aria-label="Mover antes"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    onClick={() => reorderHeroSlide(slide.id, 1)}
                    disabled={i === heroSlides.length - 1}
                    className="text-ink-3 transition-colors hover:text-neifert disabled:opacity-30"
                    aria-label="Mover después"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    onClick={() => removeHeroSlide(slide.id)}
                    className="ml-2 text-ink-3 transition-colors hover:text-neifert"
                    aria-label="Borrar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Título"
                  value={slide.title}
                  onChange={(v) => updateHeroSlide(slide.id, { title: v })}
                />
                <TextField
                  label="Subtítulo"
                  value={slide.subtitle}
                  onChange={(v) => updateHeroSlide(slide.id, { subtitle: v })}
                />
                <div className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                    Imagen
                  </span>
                  <ImageUploader
                    multiple={false}
                    value={slide.image ? [slide.image] : []}
                    onChange={(urls) => updateHeroSlide(slide.id, { image: urls[0] || '' })}
                  />
                </div>
              </div>
            </div>
          ))}
          {heroSlides.length === 0 && (
            <p className="text-sm text-ink-3">No hay imágenes en el carrusel. Agregá una arriba.</p>
          )}
        </div>
      </Section>

      <Section title="Encabezado (Hero)">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Badge" value={home.heroBadge} onChange={(v) => setHome({ heroBadge: v })} />
          <div />
          <TextField label="Título — inicio" value={home.heroTitleA} onChange={(v) => setHome({ heroTitleA: v })} />
          <TextField label="Título — palabra destacada (roja)" value={home.heroTitleEm} onChange={(v) => setHome({ heroTitleEm: v })} />
          <TextField label="Título — final" value={home.heroTitleB} onChange={(v) => setHome({ heroTitleB: v })} className="sm:col-span-2" />
          <TextField label="Subtítulo" value={home.heroSubtitle} onChange={(v) => setHome({ heroSubtitle: v })} textarea className="sm:col-span-2" />
        </div>
      </Section>

      <Section title="Llamado a la acción (CTA)">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Título — inicio" value={home.ctaTitleA} onChange={(v) => setHome({ ctaTitleA: v })} />
          <TextField label="Título — destacado (rojo)" value={home.ctaTitleEm} onChange={(v) => setHome({ ctaTitleEm: v })} />
          <TextField label="Título — final" value={home.ctaTitleB} onChange={(v) => setHome({ ctaTitleB: v })} />
          <TextField label="Subtítulo" value={home.ctaSubtitle} onChange={(v) => setHome({ ctaSubtitle: v })} textarea className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
              Imagen de fondo
            </span>
            <ImageUploader
              multiple={false}
              value={home.ctaImage ? [home.ctaImage] : []}
              onChange={(urls) => setHome({ ctaImage: urls[0] || '' })}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Historias y testimonios"
        desc="Aparecen en la home en zig-zag."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="glass" icon={Video} onClick={() => addStory({ kind: 'video', title: 'Nuevo video', caption: '', duration: '', video_url: '', poster_url: '' })}>
              Video
            </Button>
            <Button size="sm" variant="glass" icon={ImageIcon} onClick={() => addStory({ kind: 'photo', title: 'Nueva foto', caption: '', poster_url: '' })}>
              Foto
            </Button>
            <Button size="sm" variant="glass" icon={Quote} onClick={() => addStory({ kind: 'testimonial', quote: '', author_name: '', author_role: '' })}>
              Testimonio
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {stories.map((st) => (
            <div key={st.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neifert">
                  {st.kind === 'video' ? <Video size={13} /> : st.kind === 'photo' ? <ImageIcon size={13} /> : <Quote size={13} />}
                  {st.kind === 'video' ? 'Video' : st.kind === 'photo' ? 'Foto' : 'Testimonio'}
                </span>
                <button
                  onClick={() => removeStory(st.id)}
                  className="text-ink-3 transition-colors hover:text-neifert"
                  aria-label="Borrar"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {st.kind === 'video' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Título" value={st.title} onChange={(v) => updateStory(st.id, { title: v })} />
                  <TextField label="Caption" value={st.caption} onChange={(v) => updateStory(st.id, { caption: v })} />
                  <TextField label="Duración (opcional)" value={st.duration} onChange={(v) => updateStory(st.id, { duration: v })} />
                  <TextField label="URL del video (opcional)" value={st.video_url} onChange={(v) => updateStory(st.id, { video_url: v })} placeholder="https://…/video.mp4" />
                  <div className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">Video (se reproduce solo al hacer scroll)</span>
                    <VideoUploader value={st.video_url} onChange={(url) => updateStory(st.id, { video_url: url })} />
                  </div>
                  <div className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">Póster (mientras carga el video)</span>
                    <ImageUploader
                      multiple={false}
                      value={st.poster_url ? [st.poster_url] : []}
                      onChange={(urls) => updateStory(st.id, { poster_url: urls[0] || '' })}
                    />
                  </div>
                </div>
              )}

              {st.kind === 'photo' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Título" value={st.title} onChange={(v) => updateStory(st.id, { title: v })} />
                  <TextField label="Caption" value={st.caption} onChange={(v) => updateStory(st.id, { caption: v })} />
                  <div className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">Imagen</span>
                    <ImageUploader
                      multiple={false}
                      value={st.poster_url ? [st.poster_url] : []}
                      onChange={(urls) => updateStory(st.id, { poster_url: urls[0] || '' })}
                    />
                  </div>
                </div>
              )}

              {st.kind === 'testimonial' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Cita" value={st.quote} onChange={(v) => updateStory(st.id, { quote: v })} textarea className="sm:col-span-2" />
                  <TextField label="Autor" value={st.author_name} onChange={(v) => updateStory(st.id, { author_name: v })} />
                  <TextField label="Rol" value={st.author_role} onChange={(v) => updateStory(st.id, { author_role: v })} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

/* ----------------------------- INSTAGRAM ----------------------------- */
// El botón pega a /api/instagram/sync, que solo existe como plugin de Vite
// en `npm run dev` — no hay función serverless equivalente en Vercel a
// propósito (Instagram bloquea el scraping desde IPs de datacenter). Fuera
// de localhost no tiene forma de funcionar, así que ni se muestra.
const isLocalDev =
  typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

function InstagramTab() {
  const ig = useSiteStore((s) => s.instagram)
  const [syncing, setSyncing] = useState(false)

  const runSync = async () => {
    setSyncing(true)
    try {
      const result = await syncInstagramFeed()
      if (result.added > 0) toast.success(result.message)
      else toast.info(result.message)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-5">
      <Section
        title="Feed de Instagram"
        desc="La galería ya no se edita a mano acá — se actualiza corriendo la sincronización real, que trae los últimos posteos del perfil."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-ink-2">
            Hay <span className="font-semibold text-ink">{ig.items.length}</span> posteos guardados.
            Se ven en{' '}
            <a href="/instagram" target="_blank" rel="noreferrer" className="text-neifert underline">
              /instagram
            </a>
            .
          </p>
          {isLocalDev ? (
            <Button icon={RefreshCw} onClick={runSync} disabled={syncing}>
              {syncing ? 'Sincronizando…' : 'Actualizar Instagram'}
            </Button>
          ) : (
            <p className="max-w-xs text-xs text-ink-3">
              El botón de sincronizar solo aparece corriendo el proyecto local (
              <code className="font-mono">npm run dev</code>). Instagram bloquea el scraping desde
              servidores como los de Vercel, así que acá no puede funcionar — corré{' '}
              <code className="font-mono">npm run sync:instagram</code> desde tu computadora.
            </p>
          )}
        </div>
      </Section>
    </div>
  )
}

/* ------------------------------ FOOTER ------------------------------- */
function FooterTab() {
  const footer = useSiteStore((s) => s.footer)
  const setFooter = useSiteStore((s) => s.setFooter)

  const setColumns = (columns) => setFooter({ columns })
  const updateCol = (ci, patch) =>
    setColumns(footer.columns.map((c, i) => (i === ci ? { ...c, ...patch } : c)))
  const updateItem = (ci, ii, patch) =>
    updateCol(ci, {
      items: footer.columns[ci].items.map((it, i) => (i === ii ? { ...it, ...patch } : it)),
    })
  const addItem = (ci) =>
    updateCol(ci, { items: [...footer.columns[ci].items, { label: 'Nuevo', href: '#' }] })
  const removeItem = (ci, ii) =>
    updateCol(ci, { items: footer.columns[ci].items.filter((_, i) => i !== ii) })

  return (
    <div className="space-y-5">
      <Section title="Textos generales">
        <div className="grid gap-4">
          <TextField label="Descripción" value={footer.tagline} onChange={(v) => setFooter({ tagline: v })} textarea />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Título del boletín" value={footer.newsletterTitle} onChange={(v) => setFooter({ newsletterTitle: v })} />
            <TextField label="Copyright" value={footer.copyright} onChange={(v) => setFooter({ copyright: v })} />
          </div>
        </div>
      </Section>

      {footer.columns.map((col, ci) => (
        <Section
          key={ci}
          title={`Columna: ${col.title || '—'}`}
          action={
            <Button size="sm" variant="glass" icon={Plus} onClick={() => addItem(ci)}>
              Enlace
            </Button>
          }
        >
          <TextField label="Título de la columna" value={col.title} onChange={(v) => updateCol(ci, { title: v })} className="mb-3" />
          <div className="space-y-2">
            {col.items.map((it, ii) => (
              <div key={ii} className="flex items-center gap-2">
                <input className={inputCls} value={it.label} onChange={(e) => updateItem(ci, ii, { label: e.target.value })} placeholder="Texto" />
                <input className={inputCls} value={it.href} onChange={(e) => updateItem(ci, ii, { href: e.target.value })} placeholder="/ruta o https://…" />
                <button onClick={() => removeItem(ci, ii)} className="shrink-0 text-ink-3 hover:text-neifert" aria-label="Borrar">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

/* ------------------------------ REDES -------------------------------- */
function RedesTab() {
  const socials = useSiteStore((s) => s.socials)
  const setSocials = useSiteStore((s) => s.setSocials)

  return (
    <div className="space-y-5">
      <Section title="Contacto" desc="El teléfono se usa en todos los botones de WhatsApp del sitio.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="WhatsApp (con código de país)" value={socials.whatsappPhone} onChange={(v) => setSocials({ whatsappPhone: v })} placeholder="543564562413" />
          <div />
          <TextField label="Dirección" value={socials.address} onChange={(v) => setSocials({ address: v })} />
          <TextField label="Horarios" value={socials.hours} onChange={(v) => setSocials({ hours: v })} />
        </div>
      </Section>

      <Section title="Redes sociales" desc="Enlaces globales (footer e Instagram).">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Instagram" value={socials.instagram} onChange={(v) => setSocials({ instagram: v })} placeholder="https://instagram.com/…" />
          <TextField label="Facebook" value={socials.facebook} onChange={(v) => setSocials({ facebook: v })} placeholder="https://facebook.com/…" />
          <TextField label="X / Twitter" value={socials.x} onChange={(v) => setSocials({ x: v })} placeholder="https://x.com/…" />
        </div>
      </Section>
    </div>
  )
}

export default function AdminContentPage() {
  const [tab, setTab] = useState('home')
  const resetContent = useSiteStore((s) => s.resetContent)

  const onReset = () => {
    if (confirm('¿Restablecer todo el contenido a los valores por defecto?')) {
      resetContent()
      toast.success('Contenido restablecido')
    }
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neifert">Gestión</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">Contenido</h1>
          <p className="mt-1 text-sm text-ink-3">Los cambios se guardan automáticamente.</p>
        </div>
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReset}>
          Restablecer
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              tab === t.id ? 'bg-neifert text-white shadow-glow-red' : 'glass text-ink-2 hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'home' && <HomeTab />}
      {tab === 'categorias' && <CatalogTab />}
      {tab === 'instagram' && <InstagramTab />}
      {tab === 'footer' && <FooterTab />}
      {tab === 'redes' && <RedesTab />}
    </section>
  )
}
