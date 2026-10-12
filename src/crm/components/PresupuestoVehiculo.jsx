import logoNeifert from '@/assets/images/logo-dark.png'

const ROJO = '#ff1d1d'
const ROJO_SUAVE = '#ff4d4d'
const DORADO = '#9c7a3c'
const FONDO = '#06070b'
const PANEL = '#0a0d14'

const F = "'Inter', Arial, 'Helvetica Neue', sans-serif"

function Adorno({ lado = 'izq' }) {
  const esIzq = lado === 'izq'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        transform: esIzq ? 'none' : 'scaleX(-1)',
        flexShrink: 0,
      }}
    >
      <div style={{ width: 150, height: 26, background: '#2a2d33', clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)', opacity: 0.9 }} />
      <div style={{ width: 110, height: 26, background: ROJO, clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)', marginLeft: -18 }} />
    </div>
  )
}

function SeparadorRojo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
      <div style={{ height: 1, width: 130, background: DORADO, opacity: 0.8 }} />
      <div style={{ color: ROJO, fontWeight: 900, fontSize: 26, letterSpacing: 2 }}>///</div>
      <div style={{ height: 1, width: 130, background: DORADO, opacity: 0.8 }} />
    </div>
  )
}

function tamanoPrecio(texto) {
  const len = String(texto ?? '').length
  if (len <= 9) return 84
  if (len <= 11) return 72
  if (len <= 13) return 60
  if (len <= 16) return 50
  return 42
}

/** Plantilla de presupuesto Neifert — solo estilos inline para exportar fiel a PNG/PDF. */
export default function PresupuestoVehiculo({ datos, nodoRef }) {
  const fin = Array.from({ length: 6 }, (_, i) => datos.financiacion?.[i] ?? { entrega: '', cuotas: '' })
  return (
    <div
      ref={nodoRef}
      data-testid="presupuesto-plantilla"
      style={{
        width: 1080,
        background: FONDO,
        color: '#fff',
        fontFamily: F,
        padding: '34px 40px 44px',
        position: 'relative',
        overflow: 'hidden',
        lineHeight: 1.3,
      }}
    >
      {/* marco lateral sutil */}
      <div style={{ position: 'absolute', left: 14, top: 0, bottom: 0, width: 2, background: 'linear-gradient(#3a2c12, transparent)' }} />
      <div style={{ position: 'absolute', right: 14, top: 0, bottom: 0, width: 2, background: 'linear-gradient(#3a2c12, transparent)' }} />

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ paddingTop: 14 }}>
          <Adorno lado="izq" />
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <img
            src={logoNeifert}
            alt="Neifert Automotores"
            draggable={false}
            style={{ width: 540, height: 'auto', objectFit: 'contain', mixBlendMode: 'screen' }}
          />
        </div>
        <div style={{ paddingTop: 14 }}>
          <Adorno lado="der" />
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <div style={{ fontSize: 26, letterSpacing: 8, color: '#e8e8e8' }}>San Francisco, Córdoba, Argentina</div>
        <div style={{ fontSize: 24, letterSpacing: 10, color: '#e8e8e8', marginTop: 8 }}>Av. Urquiza 895</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 22 }}>
        <SeparadorRojo />
        <div style={{ color: ROJO, fontWeight: 900, fontSize: 38, letterSpacing: 1 }}>PRESUPUESTO</div>
        <div style={{ color: ROJO, fontWeight: 900, fontSize: 38 }}>{datos.fecha}</div>
        <SeparadorRojo />
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: 0.5 }}>{datos.titulo}</div>
        <div style={{ fontSize: 23, letterSpacing: 3, color: '#d7d7d7', marginTop: 6 }}>{datos.subtitulo}</div>
      </div>

      <div style={{ height: 2, background: '#cfcfcf', opacity: 0.7, marginTop: 18 }} />

      {/* precio contado */}
      <div
        style={{
          marginTop: 14,
          border: `1.5px solid ${ROJO}`,
          background: PANEL,
          display: 'flex',
          minHeight: 250,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', padding: '20px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                background: ROJO_SUAVE,
                color: '#fff',
                fontWeight: 900,
                fontSize: 30,
                padding: '8px 34px 8px 22px',
                clipPath: 'polygon(0 0, 88% 0, 100% 100%, 0 100%)',
              }}
            >
              PRECIO DE CONTADO
            </div>
            <div style={{ color: ROJO, fontWeight: 900, fontSize: 30, marginLeft: 6 }}>///</div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              marginTop: 14,
              flexWrap: 'nowrap',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 40, fontWeight: 900, flexShrink: 0 }}>ENTREGA:</span>
            <span
              style={{
                fontSize: tamanoPrecio(datos.precioEntrega),
                fontWeight: 900,
                color: ROJO,
                lineHeight: 1,
                fontStyle: 'italic',
                transform: 'skewX(-8deg)',
                display: 'inline-block',
                whiteSpace: 'nowrap',
                minWidth: 0,
                paddingRight: 12,
              }}
            >
              {datos.precioEntrega}
            </span>
          </div>
          <div style={{ height: 2, background: '#e5e5e5', opacity: 0.85, margin: '14px 0' }} />
          <div style={{ fontSize: 32, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            + PATENTAMIENTO APROX.:{' '}
            <span style={{ color: ROJO, fontStyle: 'italic', display: 'inline-block', transform: 'skewX(-8deg)' }}>
              {datos.patentamientoMonto}
            </span>
          </div>
        </div>
        <div
          style={{
            width: 240,
            borderLeft: `1px solid ${ROJO}55`,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {[150, 190, 230].map((s, i) => (
            <div
              key={s}
              style={{
                position: 'absolute',
                width: s,
                height: s,
                borderRadius: '50%',
                border: `${i === 1 ? 6 : 3}px solid ${i === 1 ? ROJO : '#ffffff55'}`,
                borderTopColor: i === 0 ? 'transparent' : undefined,
                borderStyle: i === 2 ? 'dashed' : 'solid',
                opacity: 0.85,
              }}
            />
          ))}
        </div>
      </div>

      {/* incluye */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          background: '#0c0e15',
          border: '1px solid #4a2a35',
          borderTop: 'none',
          padding: '16px 22px',
          clipPath: 'polygon(0 0, 100% 0, 100% 78%, 98.5% 100%, 0 100%)',
        }}
      >
        <div
          style={{
            width: 86,
            height: 86,
            flexShrink: 0,
            border: `2px solid ${ROJO_SUAVE}`,
            transform: 'skewX(-16deg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 46,
          }}
        >
          <span style={{ transform: 'skewX(16deg)' }}>🎁</span>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>
            <span style={{ color: ROJO }}>INCLUYE:</span>{' '}
            <span style={{ fontWeight: 600 }}>&nbsp;&nbsp;{datos.incluye}</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: ROJO, marginTop: 4 }}>{datos.regalo}</div>
        </div>
      </div>

      {/* financiación */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 26 }}>
        <SeparadorRojo />
        <div style={{ color: ROJO, fontWeight: 900, fontSize: 38 }}>FINANCIACIÓN</div>
        <SeparadorRojo />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        {fin.map((f, i) => (
          <div
            key={i}
            style={{ display: 'flex', border: `1.5px solid ${DORADO}`, background: '#05070b', minHeight: 108 }}
          >
            <div
              style={{
                width: 78,
                background: ROJO_SUAVE,
                color: '#000',
                fontWeight: 900,
                fontSize: 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ padding: '12px 16px', fontSize: 21, lineHeight: 1.35 }}>
              <div style={{ color: ROJO, fontWeight: 800 }}>{f.entrega}</div>
              <div style={{ color: '#fff' }}>{f.cuotas}</div>
            </div>
          </div>
        ))}
      </div>

      {/* pie */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.15fr 1.3fr',
          border: `1.5px solid ${DORADO}`,
          marginTop: 14,
          background: '#05070b',
        }}
      >
        {[
          { icono: '🧾', titulo: 'CONDICIONES', texto: datos.condiciones },
          { icono: '📋', titulo: 'PATENTAMIENTO', texto: datos.patentamientoTexto },
          { icono: '📅', titulo: 'FECHA LÍMITE', texto: datos.fechaLimite },
        ].map((c) => (
          <div key={c.titulo} style={{ padding: '20px 22px', borderLeft: `1px solid ${DORADO}66` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 34 }}>{c.icono}</span>
              <span style={{ color: ROJO, fontWeight: 900, fontSize: 23 }}>{c.titulo}</span>
            </div>
            <div style={{ marginTop: 12, fontSize: 19, lineHeight: 1.55, whiteSpace: 'pre-line', color: '#eee' }}>
              {c.texto}
            </div>
          </div>
        ))}
      </div>

      {/* footer deco */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 }}>
        <div style={{ width: 16, height: 16, background: ROJO }} />
        <div style={{ display: 'flex', gap: 0 }}>
          <div style={{ width: 150, height: 26, background: '#2a2d33', clipPath: 'polygon(18% 0, 100% 0, 100% 100%, 0 100%)' }} />
          <div style={{ width: 110, height: 26, background: ROJO, clipPath: 'polygon(18% 0, 100% 0, 100% 100%, 0 100%)', marginLeft: -18 }} />
        </div>
      </div>
    </div>
  )
}
