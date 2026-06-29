import { useState } from 'react'
import Button from '@/components/common/Button'
import ImageUploader from './ImageUploader'
import { VEHICLE_CATEGORIES, FUEL_TYPES, TRANSMISSIONS } from '@/lib/constants'
import { cn } from '@/lib/cn'

const STATUSES = [
  { id: 'disponible', label: 'Disponible' },
  { id: 'reservado', label: 'Reservado' },
  { id: 'vendido', label: 'Vendido' },
]

const CATS = VEHICLE_CATEGORIES.filter((c) => c.id !== 'todos')

const fieldCls =
  'glass h-11 w-full rounded-xl px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-neifert'

function Field({ label, children, full }) {
  return (
    <label className={cn('block', full && 'sm:col-span-2')}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}

const EMPTY = {
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  price_usd: '',
  km: 0,
  fuel_type: 'Nafta',
  transmission: 'Automática',
  engine: '',
  category: 'suv',
  status: 'disponible',
  is_premium: false,
  description: '',
  images: [],
}

export default function VehicleForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...initial,
    images: initial?.images?.length
      ? initial.images
      : initial?.main_image_url
        ? [initial.main_image_url]
        : [],
  }))

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      year: Number(form.year) || null,
      price_usd: Number(form.price_usd) || 0,
      km: Number(form.km) || 0,
      main_image_url: form.images[0] || null,
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Marca">
        <input className={fieldCls} value={form.brand} onChange={(e) => set('brand', e.target.value)} required placeholder="Ej: Audi" />
      </Field>
      <Field label="Modelo">
        <input className={fieldCls} value={form.model} onChange={(e) => set('model', e.target.value)} required placeholder="Ej: RS6 Avant" />
      </Field>
      <Field label="Año">
        <input type="number" className={fieldCls} value={form.year} onChange={(e) => set('year', e.target.value)} />
      </Field>
      <Field label="Precio (U$S)">
        <input type="number" className={fieldCls} value={form.price_usd} onChange={(e) => set('price_usd', e.target.value)} placeholder="0" />
      </Field>
      <Field label="Kilómetros">
        <input type="number" className={fieldCls} value={form.km} onChange={(e) => set('km', e.target.value)} />
      </Field>
      <Field label="Motor">
        <input className={fieldCls} value={form.engine} onChange={(e) => set('engine', e.target.value)} placeholder="Ej: 4.0L V8" />
      </Field>
      <Field label="Combustible">
        <select className={fieldCls} value={form.fuel_type} onChange={(e) => set('fuel_type', e.target.value)}>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </Field>
      <Field label="Tipo de caja">
        <select className={fieldCls} value={form.transmission} onChange={(e) => set('transmission', e.target.value)}>
          {TRANSMISSIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Categoría">
        <select className={fieldCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
          {CATS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Estado">
        <select className={fieldCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Descripción" full>
        <textarea
          className={cn(fieldCls, 'h-auto min-h-[80px] resize-none py-2.5')}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Detalle del vehículo…"
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.is_premium}
          onChange={(e) => set('is_premium', e.target.checked)}
          className="h-4 w-4 accent-[color:var(--c-neifert,#BE1E2D)]"
        />
        <span className="text-sm text-ink">Destacar como Premium</span>
      </label>

      <Field label="Fotos" full>
        <ImageUploader value={form.images} onChange={(images) => set('images', images)} />
      </Field>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar vehículo'}
        </Button>
      </div>
    </form>
  )
}
