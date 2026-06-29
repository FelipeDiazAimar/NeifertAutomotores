export default function TopModelsList({ models }) {
  return (
    <ul className="space-y-1">
      {models.map((m) => (
        <li
          key={m.rank}
          className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-surface"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-neifert/10 text-sm font-bold text-neifert">
            {m.rank}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{m.name}</p>
            {m.sub && <p className="text-xs text-ink-3">{m.sub}</p>}
          </div>
          <div className="text-right">
            <p className="font-bold text-neifert">{m.interest}%</p>
            <p className="text-[10px] uppercase tracking-wide text-ink-3">interés</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
