import { useState } from 'react'
import Button from '@/components/common/Button'
import ImageUploader from './ImageUploader'
import { FUEL_TYPES, TRANSMISSIONS, ARS_TO_USD_RATE } from '@/lib/constants'
import { useSiteStore } from '@/store/useSiteStore'
import { cn } from '@/lib/cn'

const STATUSES = [
  { id: 'disponible', label: 'Disponible' },
  { id: 'reservado', label: 'Reservado' },
  { id: 'vendido', label: 'Vendido' },
]

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

const CURRENCIES = [
  { id: 'USD', label: 'U$S' },
  { id: 'ARS', label: 'AR$' },
]

const EMPTY = {
  brand: '',
  model: '',
  version: '',
  color: '',
  year: new Date().getFullYear(),
  currency: 'USD',
  price_amount: '',
  km: 0,
  fuel_type: 'Nafta',
  transmission: 'Automática',
  engine: '',
  category: 'suv',
  status: 'disponible',
  is_new: false,
  description: '',
  images: [],
}

export default function VehicleForm({ initial, onSave, onCancel, saving }) {
  const categories = useSiteStore((s) => s.categories)
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    category: initial?.category ?? categories[0]?.id ?? '',
    ...initial,
    price_amount: initial?.price_amount ?? initial?.price_usd ?? '',
    images: initial?.images?.length
      ? initial.images
      : initial?.main_image_url
        ? [initial.main_image_url]
        : [],
  }))

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    const priceAmount = Number(form.price_amount) || 0
    const priceUsd = form.currency === 'ARS' ? priceAmount * ARS_TO_USD_RATE : priceAmount
    onSave({
      ...form,
      year: Number(form.year) || null,
      price_amount: form.price_amount === '' ? null : priceAmount,
      price_usd: priceUsd,
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
      <Field label="Versión / trim (opcional)">
        <input className={fieldCls} value={form.version || ''} onChange={(e) => set('version', e.target.value)} placeholder="Ej: SRX 2.8T 4X4 AT" />
      </Field>
      <Field label="Año">
        <input type="number" className={fieldCls} value={form.year} onChange={(e) => set('year', e.target.value)} />
      </Field>
      <Field label="Precio">
        <div className="flex gap-2">
          <select
            className={cn(fieldCls, 'w-24 shrink-0')}
            value={form.currency}
            onChange={(e) => set('currency', e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <input
            type="number"
            className={fieldCls}
            value={form.price_amount}
            onChange={(e) => set('price_amount', e.target.value)}
            placeholder="0"
          />
        </div>
      </Field>
      <Field label="Kilómetros">
        <input type="number" className={fieldCls} value={form.km} onChange={(e) => set('km', e.target.value)} />
      </Field>
      <Field label="Color (opcional)">
        <input className={fieldCls} value={form.color || ''} onChange={(e) => set('color', e.target.value)} placeholder="Ej: Blanco" />
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
          {categories.length === 0 && <option value="">— Creá categorías en Contenido —</option>}
          {categories.map((c) => (
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
          checked={form.is_new}
          onChange={(e) => set('is_new', e.target.checked)}
          className="h-4 w-4 accent-[color:var(--c-neifert,#BE1E2D)]"
        />
        <span className="text-sm text-ink">Destacar como Nuevo</span>
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
