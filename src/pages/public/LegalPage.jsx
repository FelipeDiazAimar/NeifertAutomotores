import { ShieldCheck, FileText, Cookie } from 'lucide-react'

const CONTENT = {
  terms: {
    title: 'Términos de uso', icon: FileText,
    intro: 'Al navegar este sitio aceptás utilizarlo de forma responsable y con fines informativos.',
    sections: [['Información del sitio', 'Las publicaciones, precios, disponibilidad y características de los vehículos pueden cambiar sin previo aviso. Confirmá la información con nuestro equipo antes de tomar una decisión.'], ['Uso permitido', 'El contenido, imágenes y marcas del sitio pertenecen a Neifert Automotores o a sus respectivos titulares. No está permitido reproducirlos o utilizarlos sin autorización.']],
  },
  privacy: {
    title: 'Política de privacidad', icon: ShieldCheck,
    intro: 'Cuidamos los datos que compartís con nosotros al realizar una consulta o coordinar una cita.',
    sections: [['Datos que recibimos', 'Podemos recibir tu nombre, teléfono, correo y el mensaje que nos enviás para responder tu consulta.'], ['Cómo los usamos', 'Usamos esa información únicamente para atenderte, coordinar una visita y mejorar la comunicación comercial. No vendemos tus datos a terceros.']],
  },
  cookies: {
    title: 'Política de cookies', icon: Cookie,
    intro: 'Este sitio puede usar almacenamiento local y tecnologías similares para recordar preferencias y mejorar la experiencia.',
    sections: [['Qué son', 'Las cookies son pequeños archivos que permiten que el sitio recuerde determinadas acciones o preferencias.'], ['Tu control', 'Podés borrar o bloquear cookies desde la configuración de tu navegador. Algunas funciones podrían dejar de recordar tus preferencias.']],
  },
}

export default function LegalPage({ type }) {
  const page = CONTENT[type] || CONTENT.terms
  const Icon = page.icon
  return <section className="mx-auto max-w-3xl px-4 py-14 md:px-8">
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-neifert/10 text-neifert"><Icon size={22} /></span>
    <h1 className="mt-5 font-display text-4xl font-extrabold text-ink">{page.title}</h1>
    <p className="mt-4 text-lg text-ink-2">{page.intro}</p>
    <div className="mt-10 space-y-6">
      {page.sections.map(([title, text]) => <article key={title} className="rounded-2xl border border-line bg-surface p-6"><h2 className="font-display text-xl font-bold text-ink">{title}</h2><p className="mt-2 leading-relaxed text-ink-2">{text}</p></article>)}
    </div>
  </section>
}
