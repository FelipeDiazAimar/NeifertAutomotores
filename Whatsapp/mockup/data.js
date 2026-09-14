/* Datos de ejemplo del mockup. Nombres, teléfonos y unidades son ficticios. */

const ME = 'Lucas R.'
const VENDEDORES = ['Lucas R.', 'Sofía G.', 'Martín A.']
const LINE_PHONE = '+54 3564 56-2413' // WHATSAPP_PHONE de src/lib/constants.js

// Mismas etiquetas que LEAD_STATUSES del proyecto.
const ESTADOS = {
  nuevo: ['Nuevo', 'red'],
  primer_contacto: ['Primer Contacto', ''],
  seguimiento: ['Seguimiento', ''],
  negociacion: ['En Negociación', 'amber'],
  vip: ['Calificado / VIP', 'green'],
  cerrado: ['Cerrado', 'green'],
}

const UNITS = [
  { id: 'u1', name: 'Toyota Hilux SRV 4x4', year: 2022, km: 62000, price: 'USD 34.500', svg: { color: '#e8ebee', body: 'pickup' } },
  { id: 'u5', name: 'Toyota Hilux SR 4x2', year: 2021, km: 91000, price: 'USD 28.900', svg: { color: '#7a1c22', body: 'pickup' } },
  { id: 'u2', name: 'Volkswagen Amarok Highline V6', year: 2021, km: 78000, price: 'USD 31.900', svg: { color: '#2b3440', body: 'pickup' } },
  { id: 'u3', name: 'Fiat Cronos Drive 1.3', year: 2023, km: 18500, price: '$ 21.800.000', svg: { color: '#8f1d24', body: 'sedan' } },
  { id: 'u4', name: 'Peugeot 208 Allure', year: 2020, km: 54000, price: '$ 17.900.000', svg: { color: '#3a6ea5', body: 'hatch' } },
]

const CHATS = [
  {
    id: 'c1', name: 'Mariana López', phone: '+54 9 3564 41-2290', known: true, estado: 'negociacion', canal: 'WhatsApp',
    assigned: 'Lucas R.', unread: 0, lastT: '11:42', order: 100,
    client: {
      localidad: 'Frontera', presupuesto: 'USD 35.000', busca: 'Toyota Hilux', tipo: 'Pickup', anios: '2021 – 2023', trans: 'Manual',
      notas: 'Entrega Toyota Etios 2018 (88.000 km) como parte de pago. Viene mañana a las 10.',
      tasks: [{ t: 'Tasar Toyota Etios 2018', when: 'Mañana 10:00', done: false }, { t: 'Pasar simulación de financiación', when: 'Hoy', done: true }],
      matches: ['u1', 'u5'],
    },
    msgs: [
      { type: 'day', text: 'Hoy' },
      { id: 'm1', dir: 'in', type: 'text', t: '10:58', text: 'Hola! Vi la Hilux blanca en Instagram, ¿sigue disponible?' },
      { type: 'sys', text: 'Lucas R. tomó el chat · 10:59' },
      { id: 'm2', dir: 'out', type: 'unit', unit: 'u1', t: '10:59', status: 'read', author: 'Lucas R.', text: 'Hola Mariana, sí, está disponible. Te paso la ficha:' },
      { id: 'm3', dir: 'in', type: 'text', t: '11:04', text: '¿Toman usado? Tengo un Etios 2018' },
      { id: 'm4', dir: 'out', type: 'text', t: '11:06', status: 'read', author: 'Lucas R.', text: 'Sí, tomamos usados. Mandame fotos y te paso una idea de valor.' },
      { id: 'm5', dir: 'in', type: 'photo', t: '11:15', photo: { color: '#b8bec6', body: 'sedan' }, file: 'IMG-20260914-WA0012.jpg', size: '1,8 MB', text: 'Este es, tiene 88 mil km' },
      { id: 'm6', dir: 'in', type: 'voice', t: '11:16', dur: 42 },
      { id: 'm7', dir: 'in', type: 'text', t: '11:20', text: '¿Y si pongo el Etios más 20 mil dólares me la dejan?', deleted: { at: '11:31' } },
      { id: 'm8', dir: 'out', type: 'text', t: '11:35', status: 'delivered', edited: true, author: 'Lucas R.', text: 'La tasación final la hacemos en el salón. ¿Te queda bien mañana a las 10?' },
      { id: 'm9', dir: 'in', type: 'text', t: '11:42', text: 'Dale, mañana a las 10 estoy ahí' },
      { id: 'm10', dir: 'in', type: 'text', t: '11:42', text: '¿Llevo la cédula verde?' },
    ],
  },
  {
    id: 'c2', name: '+54 9 3492 55-8810', pushName: 'Ramiro', phone: '+54 9 3492 55-8810', known: false, estado: null, canal: 'WhatsApp',
    assigned: '', unread: 2, lastT: '11:20', order: 99, client: null,
    msgs: [
      { type: 'day', text: 'Hoy' },
      { id: 'n1', dir: 'in', type: 'text', t: '11:19', text: 'Buenas, ¿toman usados?' },
      { id: 'n2', dir: 'in', type: 'photo', t: '11:20', photo: { color: '#c9ccd1', body: 'hatch' }, file: 'IMG-20260914-WA0031.jpg', size: '2,1 MB', text: 'Gol Trend 2016, 120 mil km' },
    ],
  },
  {
    id: 'c4', name: 'Valeria Sosa', phone: '+54 9 3562 44-1082', known: true, estado: 'nuevo', canal: 'Web',
    assigned: '', unread: 1, lastT: 'Ayer', order: 90,
    client: {
      localidad: 'Morteros', presupuesto: '—', busca: 'Peugeot 208', tipo: 'Hatchback', anios: '2019 – 2021', trans: '—',
      notas: 'Sin notas todavía.', tasks: [], matches: ['u4'],
    },
    msgs: [
      { type: 'day', text: 'Ayer' },
      { type: 'sys', text: 'Llegó desde el botón de WhatsApp del sitio' },
      { id: 'v1', dir: 'in', type: 'text', t: '19:48', text: 'Hola, consulta por el Peugeot 208 Allure 2020 que está en la página. ¿Aceptan tarjeta?' },
    ],
  },
  {
    id: 'c3', name: 'Carlos Bustos', phone: '+54 9 3564 50-7731', known: true, estado: 'seguimiento', canal: 'Showroom',
    assigned: 'Sofía G.', unread: 0, lastT: 'Sáb', order: 80,
    client: {
      localidad: 'Devoto', presupuesto: '$ 22.000.000', busca: 'Fiat Cronos', tipo: 'Sedan', anios: '2022 – 2024', trans: 'Manual',
      notas: 'Quiere financiar el 50%. Prefiere colores oscuros.',
      tasks: [{ t: 'Llamar para ver si decidió', when: 'Mar 15/09', done: false }], matches: ['u3'],
    },
    msgs: [
      { type: 'day', text: 'Sábado 12 de septiembre' },
      { id: 'b1', dir: 'in', type: 'text', t: '10:12', text: 'Hola Sofía, ¿me pasás el presupuesto del Cronos con financiación?' },
      { id: 'b2', dir: 'out', type: 'doc', t: '10:40', status: 'read', author: 'Sofía G.', file: 'Presupuesto_Cronos_Drive_2023.pdf', size: '312 KB', text: 'Te dejo el presupuesto con 12 y 18 cuotas.' },
      { id: 'b3', dir: 'in', type: 'voice', t: '11:02', dur: 18 },
      { id: 'b4', dir: 'in', type: 'text', t: '11:03', text: 'Gracias, lo charlo en casa y te aviso' },
    ],
  },
  {
    id: 'c5', name: 'Diego Ferreyra', phone: '+54 9 3564 60-2218', known: true, estado: 'cerrado', canal: 'Referido',
    assigned: 'Lucas R.', unread: 0, lastT: 'Vie', order: 70,
    client: {
      localidad: 'San Francisco', presupuesto: 'USD 32.000', busca: 'VW Amarok', tipo: 'Pickup', anios: '2020 – 2022', trans: 'Automática',
      notas: 'Compró Amarok Highline V6 2021. Retira el lunes.',
      tasks: [{ t: 'Entrega de unidad', when: 'Lun 14/09 18:00', done: false }], matches: [],
    },
    msgs: [
      { type: 'day', text: 'Viernes 11 de septiembre' },
      { id: 'd1', dir: 'out', type: 'text', t: '17:10', status: 'read', author: 'Lucas R.', text: 'Diego, ya salió la transferencia. Podés pasar a retirar la Amarok desde el lunes.' },
      { id: 'd2', dir: 'in', type: 'voice', t: '17:25', dur: 9 },
      { id: 'd3', dir: 'in', type: 'text', t: '17:26', text: '¿Me la pueden lavar antes de retirarla?', deleted: { at: '17:27' } },
    ],
  },
  {
    id: 'c6', name: 'Norma Giménez', phone: '+54 9 3564 38-9104', known: true, estado: 'primer_contacto', canal: 'Instagram',
    assigned: 'Martín A.', unread: 0, lastT: 'Jue', order: 60,
    client: {
      localidad: 'Freyre', presupuesto: '$ 25.000.000', busca: '0 km o seminuevo', tipo: 'Sedan', anios: '2023 – 2026', trans: 'Manual',
      notas: 'Sin notas todavía.', tasks: [], matches: ['u3'],
    },
    msgs: [
      { type: 'day', text: 'Jueves 10 de septiembre' },
      { id: 'g1', dir: 'in', type: 'text', t: '09:30', text: '¿Tienen algo 0 km hasta 25 millones?' },
      { id: 'g2', dir: 'out', type: 'text', t: '09:52', status: 'read', author: 'Martín A.', text: 'Hola Norma, hoy no tenemos 0 km en ese rango, pero tengo un Cronos 2023 con 18.500 km.' },
    ],
  },
]

const LOG = [
  { t: '11:31', tone: 'wait', text: 'Mensaje eliminado por un cliente', sub: 'Mariana López · el original quedó guardado' },
  { t: '09:47', tone: 'wait', text: 'Conexión inestable', sub: 'Se reconectó sola en 4 s (intento 1 de 5)' },
  { t: '08:02', tone: 'ok', text: 'Chats sincronizados', sub: '37 chats · 1.204 mensajes' },
  { t: '08:02', tone: 'ok', text: 'Línea conectada', sub: 'Sesión recuperada del servidor, sin volver a escanear' },
]

/* Foto de auto dibujada (no hay imágenes externas en el mockup). */
function carSvg({ color = '#be1e2d', body = 'sedan' } = {}) {
  const shapes = {
    pickup: ['M18 96 L24 76 Q27 70 34 70 L70 68 L88 50 Q92 46 100 46 L128 46 Q134 46 137 52 L146 70 L178 72 Q186 73 186 81 L186 96 Z', 'M92 67 L101 54 Q103 51 107 51 L126 51 Q130 51 132 55 L138 67 Z'],
    sedan: ['M16 96 L20 80 Q22 74 30 73 L56 70 L78 54 Q84 50 92 50 L124 50 Q132 50 138 56 L154 70 L176 74 Q184 76 184 84 L184 96 Z', 'M64 70 L82 57 Q86 54 92 54 L122 54 Q128 54 132 58 L145 70 Z'],
    hatch: ['M20 96 L22 80 Q24 73 32 72 L58 70 L76 52 Q80 48 88 48 L130 48 Q140 48 146 58 L160 76 Q178 78 180 86 L180 96 Z', 'M64 70 L79 54 Q82 51 88 51 L128 51 Q136 51 140 58 L150 71 Z'],
  }
  const [b, w] = shapes[body] || shapes.sedan
  const g = 'g' + Math.random().toString(36).slice(2, 8)
  return `<svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Foto del vehículo">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe6ee"/><stop offset="1" stop-color="#aab5c1"/></linearGradient></defs>
    <rect width="200" height="150" fill="url(#${g})"/>
    <rect y="104" width="200" height="46" fill="#7d848c"/>
    <rect y="104" width="200" height="3" fill="#5f666e"/>
    <ellipse cx="100" cy="112" rx="88" ry="7" fill="#000" opacity=".22"/>
    <path d="${b}" fill="${color}" stroke="#00000033" stroke-width="1.2"/>
    <path d="${w}" fill="#1f2a36" opacity=".82"/>
    <circle cx="52" cy="98" r="14" fill="#1b1c20"/><circle cx="52" cy="98" r="6" fill="#9aa0a8"/>
    <circle cx="150" cy="98" r="14" fill="#1b1c20"/><circle cx="150" cy="98" r="6" fill="#9aa0a8"/>
  </svg>`
}

const fmtKm = (n) => new Intl.NumberFormat('es-AR').format(n)
