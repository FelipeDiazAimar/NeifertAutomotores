import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MOCK_STORIES } from '@/lib/mockData'
import { WHATSAPP_PHONE, FUEL_TYPES, TRANSMISSIONS } from '@/lib/constants'
import { isSupabaseConfigured } from '@/services/supabaseClient'
import { fetchSiteContent, saveSiteContent, CONTENT_KEYS } from '@/services/content.service'
import { deleteMedia } from '@/services/media.service'

const cleanupMedia = (url) => {
  if (url) deleteMedia(url).catch((e) => console.warn('[media-cleanup] no se pudo borrar', url, e.message))
}

/** Contenido editable del sitio (textos, testimonios, galería de Instagram,
 *  footer y enlaces de redes). En modo demo persiste en localStorage; queda
 *  listo para migrar a Supabase. Editable desde /admin/contenido. */

const uid = () => Math.random().toString(36).slice(2, 10)

/** Convierte un nombre en un id/slug estable (sin acentos ni símbolos). */
export const slugify = (str) =>
  String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'cat'

const DEFAULT_CATEGORIES = [
  { id: 'suv', label: 'SUVs' },
  { id: 'sedan', label: 'Sedanes' },
  { id: 'coupe', label: 'Coupé' },
  { id: 'sport', label: 'Sport' },
  { id: 'electrico', label: 'Eléctricos' },
  { id: 'pickup', label: 'Pickups' },
]

const DEFAULT_CONTENT = {
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  fuelTypes: [...FUEL_TYPES],
  transmissions: [...TRANSMISSIONS],
  socials: {
    instagram: 'https://www.instagram.com/neifertautomotores',
    facebook: 'https://www.facebook.com/neifertautomotores',
    x: '',
    whatsappPhone: '543564562413',
    address: 'Av. Urquiza 898, San Francisco, Córdoba',
    hours: 'Lun a Vie · 8 a 12:30 h y 16 a 20 h · Sáb 9 a 13 h',
    email: 'neifertsanfrancisco@gmail.com',
    phone: '(03564) 43-5199',
  },
  home: {
    heroBadge: 'Nuestros Clientes',
    heroTitleA: 'Más que vehículos :',
    heroTitleEm: '25\u00a0años',
    heroTitleB: 'de confianza.',
    heroSubtitle:
      'El vehículo que soñás, peritado y listo para salir. Mirá el stock disponible. En Neifert, la transparencia es innegociable.',
    ctaTitleA: '¿Listo para escribir tu propia',
    ctaTitleEm: 'historia',
    ctaTitleB: '?',
    ctaSubtitle:
      'Descubrí nuestra colección exclusiva de vehículos que esperan por un nuevo capítulo con vos al volante.',
    ctaImage:
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80',
  },
  heroSlides: [
    {
      id: 'hs1',
      image:
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=80',
      title: 'Explorá nuestra colección',
      subtitle: 'Vehículos de alta gama, peritados y listos para entrega.',
    },
    {
      id: 'hs2',
      image:
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=80',
      title: 'Excelencia en cada detalle',
      subtitle: 'Encontrá el auto que soñás con la transparencia que merecés.',
    },
    {
      id: 'hs3',
      image:
        'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1600&q=80',
      title: 'Tu próximo destino te espera',
      subtitle: 'Stock disponible para ver en el salón o coordinar tu cita.',
    },
  ],
  stories: MOCK_STORIES.map((s) => ({ ...s })),
  instagram: {
    headline: 'Seguinos en Instagram',
    subtitle: 'Las últimas entregas, novedades y detrás de escena del salón.',
    items: [
      {
        id: 'ig1',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=600&q=80',
        caption: 'Nuevo ingreso a la galería',
      },
      {
        id: 'ig2',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=600&q=80',
        caption: 'Entrega de la semana',
      },
      {
        id: 'ig3',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=600&q=80',
        caption: 'Detalles que enamoran',
      },
      {
        id: 'ig4',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=600&q=80',
        caption: 'Showroom Neifert',
      },
      {
        id: 'ig5',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=600&q=80',
        caption: 'Performance pura',
      },
      {
        id: 'ig6',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=600&q=80',
        caption: 'Edición limitada',
      },
    ],
  },
  footer: {
    tagline:
      'Redefiniendo la experiencia de movilidad premium a través del diseño, la exclusividad y la innovación constante.',
    columns: [
      {
        title: 'Navegación',
        items: [
          { label: 'Historias', href: '/' },
          { label: 'Catálogo', href: '/catalogo' },
          { label: 'Instagram', href: '/instagram' },
          { label: 'Coordinar cita', href: '/cita' },
        ],
      },
      {
        title: 'Legal',
        items: [
          { label: 'Términos', href: '/terminos' },
          { label: 'Privacidad', href: '/privacidad' },
          { label: 'Cookies', href: '/cookies' },
          { label: 'Contacto', href: '/contacto' },
        ],
      },
    ],
    newsletterTitle: 'Boletín',
    copyright: '© 2026 Neifert Automotores. Excelencia en Movimiento.',
  },
}

export const useSiteStore = create(
  persist(
    (set, get) => ({
      ...DEFAULT_CONTENT,

      // Categorías de vehículos (filtros del catálogo + alta de vehículos)
      addCategory: (label) =>
        set((s) => {
          const name = String(label || '').trim()
          if (!name) return {}
          let id = slugify(name)
          const taken = new Set(s.categories.map((c) => c.id))
          let n = 2
          const baseId = id
          while (taken.has(id)) id = `${baseId}-${n++}`
          return { categories: [...s.categories, { id, label: name }] }
        }),
      updateCategory: (id, label) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, label } : c
          ),
        })),
      removeCategory: (id) =>
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),

      // Tipos de combustible y de caja (listas simples, sin id separado del
      // texto — a diferencia de las categorías, acá el valor mostrado ES el
      // dato que se guarda en cada vehículo).
      addFuelType: (value) =>
        set((s) => {
          const v = String(value || '').trim()
          if (!v || s.fuelTypes.includes(v)) return {}
          return { fuelTypes: [...s.fuelTypes, v] }
        }),
      removeFuelType: (value) =>
        set((s) => ({ fuelTypes: s.fuelTypes.filter((f) => f !== value) })),
      addTransmission: (value) =>
        set((s) => {
          const v = String(value || '').trim()
          if (!v || s.transmissions.includes(v)) return {}
          return { transmissions: [...s.transmissions, v] }
        }),
      removeTransmission: (value) =>
        set((s) => ({ transmissions: s.transmissions.filter((t) => t !== value) })),

      setSocials: (partial) =>
        set((s) => ({ socials: { ...s.socials, ...partial } })),
      setHome: (partial) => {
        const current = get().home
        if ('ctaImage' in partial && partial.ctaImage !== current.ctaImage) cleanupMedia(current.ctaImage)
        set((s) => ({ home: { ...s.home, ...partial } }))
      },
      setFooter: (partial) => set((s) => ({ footer: { ...s.footer, ...partial } })),

      // Historias / testimonios
      addStory: (story) =>
        set((s) => ({
          stories: [
            ...s.stories,
            { id: uid(), order_index: s.stories.length + 1, ...story },
          ],
        })),
      updateStory: (id, partial) => {
        const current = get().stories.find((it) => it.id === id)
        if (current) {
          if ('video_url' in partial && partial.video_url !== current.video_url) cleanupMedia(current.video_url)
          if ('poster_url' in partial && partial.poster_url !== current.poster_url) cleanupMedia(current.poster_url)
        }
        set((s) => ({
          stories: s.stories.map((it) => (it.id === id ? { ...it, ...partial } : it)),
        }))
      },
      removeStory: (id) => {
        const current = get().stories.find((it) => it.id === id)
        if (current) {
          cleanupMedia(current.video_url)
          cleanupMedia(current.poster_url)
        }
        set((s) => ({ stories: s.stories.filter((it) => it.id !== id) }))
      },

      // Carrusel del hero (imagen + texto propio por slide)
      addHeroSlide: (slide) =>
        set((s) => ({
          heroSlides: [...s.heroSlides, { id: uid(), title: '', subtitle: '', image: '', ...slide }],
        })),
      updateHeroSlide: (id, partial) => {
        const current = get().heroSlides.find((it) => it.id === id)
        if (current && 'image' in partial && partial.image !== current.image) cleanupMedia(current.image)
        set((s) => ({
          heroSlides: s.heroSlides.map((it) => (it.id === id ? { ...it, ...partial } : it)),
        }))
      },
      removeHeroSlide: (id) => {
        const current = get().heroSlides.find((it) => it.id === id)
        if (current) cleanupMedia(current.image)
        set((s) => ({ heroSlides: s.heroSlides.filter((it) => it.id !== id) }))
      },
      reorderHeroSlide: (id, dir) =>
        set((s) => {
          const i = s.heroSlides.findIndex((it) => it.id === id)
          const j = i + dir
          if (i === -1 || j < 0 || j >= s.heroSlides.length) return {}
          const next = [...s.heroSlides]
          ;[next[i], next[j]] = [next[j], next[i]]
          return { heroSlides: next }
        }),

      resetContent: () => {
        const s = get()
        s.heroSlides.forEach((it) => cleanupMedia(it.image))
        s.stories.forEach((it) => {
          cleanupMedia(it.video_url)
          cleanupMedia(it.poster_url)
        })
        s.instagram.items.forEach((it) => cleanupMedia(it.url))
        set({ ...DEFAULT_CONTENT })
      },
    }),
    {
      name: 'nf-site-content',
      version: 2,
      migrate: (persistedState) => ({
        ...persistedState,
        socials: { ...persistedState.socials, whatsappPhone: '543564562413' },
      }),
    }
  )
)

/* ---------------------------------------------------------------------------
   Sincronización con Supabase (solo si hay credenciales; no-op en modo demo).
   - hydrateSiteContent(): trae el contenido del servidor al iniciar la app.
   - subscribe: persiste (upsert, con debounce) cada sección que cambia.
--------------------------------------------------------------------------- */

// Evita que la hidratación inicial (traer contenido de Supabase) dispare una
// escritura de "guardado" hacia atrás — sin esto, cualquier visitante anónimo
// terminaba intentando un upsert a contenido_sitio y lo rechazaba el RLS (401).
let isHydrating = false

/** Hidrata el store con el contenido guardado en Supabase. Llamar al iniciar. */
export async function hydrateSiteContent() {
  if (!isSupabaseConfigured) return
  try {
    const content = await fetchSiteContent()
    if (!content) return
    const merged = {}
    for (const k of CONTENT_KEYS) if (content[k] != null) merged[k] = content[k]
    if (Object.keys(merged).length) {
      isHydrating = true
      useSiteStore.setState(merged)
      isHydrating = false
    }
  } catch (e) {
    console.warn('[Neifert] No se pudo hidratar site_content:', e.message)
  }
}

if (isSupabaseConfigured) {
  const timers = {}
  useSiteStore.subscribe((state, prev) => {
    if (isHydrating) return
    for (const k of CONTENT_KEYS) {
      if (state[k] !== prev[k]) {
        clearTimeout(timers[k])
        timers[k] = setTimeout(() => {
          saveSiteContent(k, state[k]).catch((e) =>
            console.warn(`[Neifert] No se pudo guardar ${k}:`, e.message)
          )
        }, 800)
      }
    }
  })
}
