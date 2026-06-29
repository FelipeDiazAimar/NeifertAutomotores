import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MOCK_STORIES } from '@/lib/mockData'
import { WHATSAPP_PHONE } from '@/lib/constants'

/** Contenido editable del sitio (textos, testimonios, galería de Instagram,
 *  footer y enlaces de redes). En modo demo persiste en localStorage; queda
 *  listo para migrar a Supabase. Editable desde /admin/contenido. */

const uid = () => Math.random().toString(36).slice(2, 10)

const DEFAULT_CONTENT = {
  socials: {
    instagram: 'https://instagram.com/neifertautomotores',
    facebook: 'https://facebook.com/neifertautomotores',
    x: '',
    whatsappPhone: WHATSAPP_PHONE,
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
          { label: 'Términos', href: '#' },
          { label: 'Privacidad', href: '#' },
          { label: 'Cookies', href: '#' },
          { label: 'Contacto', href: '/cita' },
        ],
      },
    ],
    newsletterTitle: 'Boletín',
    copyright: '© 2026 Neifert Automotores. Excelencia en Movimiento.',
  },
}

export const useSiteStore = create(
  persist(
    (set) => ({
      ...DEFAULT_CONTENT,

      setSocials: (partial) =>
        set((s) => ({ socials: { ...s.socials, ...partial } })),
      setHome: (partial) => set((s) => ({ home: { ...s.home, ...partial } })),
      setInstagramMeta: (partial) =>
        set((s) => ({ instagram: { ...s.instagram, ...partial } })),
      setFooter: (partial) => set((s) => ({ footer: { ...s.footer, ...partial } })),

      // Historias / testimonios
      addStory: (story) =>
        set((s) => ({
          stories: [
            ...s.stories,
            { id: uid(), order_index: s.stories.length + 1, ...story },
          ],
        })),
      updateStory: (id, partial) =>
        set((s) => ({
          stories: s.stories.map((it) => (it.id === id ? { ...it, ...partial } : it)),
        })),
      removeStory: (id) =>
        set((s) => ({ stories: s.stories.filter((it) => it.id !== id) })),

      // Galería de Instagram
      addIgItem: (item) =>
        set((s) => ({
          instagram: {
            ...s.instagram,
            items: [...s.instagram.items, { id: uid(), type: 'image', ...item }],
          },
        })),
      updateIgItem: (id, partial) =>
        set((s) => ({
          instagram: {
            ...s.instagram,
            items: s.instagram.items.map((it) =>
              it.id === id ? { ...it, ...partial } : it
            ),
          },
        })),
      removeIgItem: (id) =>
        set((s) => ({
          instagram: {
            ...s.instagram,
            items: s.instagram.items.filter((it) => it.id !== id),
          },
        })),

      resetContent: () => set({ ...DEFAULT_CONTENT }),
    }),
    {
      name: 'nf-site-content',
      version: 1,
    }
  )
)
