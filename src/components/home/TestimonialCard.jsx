/** Cita de cliente con acento rojo lateral (estilo editorial). */
export default function TestimonialCard({ story }) {
  return (
    <div className="glass relative rounded-[20px] p-8 shadow-glass md:p-10">
      <span className="absolute bottom-10 left-0 top-10 w-1 rounded-full bg-neifert" />
      <p className="font-display text-2xl font-semibold italic leading-snug text-ink md:text-[28px]">
        “{story.quote}”
      </p>
      <div className="mt-7">
        <p className="text-xs font-bold uppercase tracking-wider text-ink">
          {story.author_name}
        </p>
        <p className="mt-0.5 text-xs text-ink-3">{story.author_role}</p>
      </div>
    </div>
  )
}
