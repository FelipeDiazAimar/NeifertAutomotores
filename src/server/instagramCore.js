/**
 * Lógica de scraping de Instagram (sin dependencias de Vite ni Vercel) para
 * poder llamarse desde el plugin de dev (src/plugins/instagramProxy.js) y
 * desde la función serverless de producción (api/instagram-proxy.js).
 *
 * fetchInstagramPage(afterCursor) → { posts, nextCursor, hasMore }
 */

const IG_USERNAME = 'neifertautomotores'
const DOC_ID_FIRST = '26558563207156056' // PolarisProfilePostsQuery
const DOC_ID_PAGED = '27839684308962379' // PolarisProfilePostsTabContentQuery_connection
const PER_PAGE = 24

// Cache de tokens de sesión (30 min) — evita re-parsear el HTML en cada request.
// Vive mientras el proceso/lambda esté "caliente"; se re-crea solo si expira.
const TOKEN_CACHE = { ts: 0, tokens: null, cookies: null }
const TOKEN_TTL = 30 * 60 * 1000

// Parámetros del bundle JS de Instagram (extraídos del HAR en sesión incógnita)
const IG_DYN = '7xe6E5q5U5ObwKBAg5S1Dxu13wvoKewSAwHwNwcy0lW4o0B-q1ew6ywaq0yE460qe4o5-1ywOwa90Fwcy1yw9O0H8jwae4UaEW2G0AEco5G0zE5W09yyES1Twoob82ZwrUdUbGw4mwr830wrd6goK10xKi2K7E5y4U158KmUhw4rwXyEcE4y16wAw4XwRzE'
const IG_CSR = 'golbtR4N4l7tEiBnl9d9eWlieSJINOmAy9SEyhpG8F8CeGh4gxGVfV98KmHzqKrgoyb8_XwJyHWgqgCEgyQFrAQ5bFBBA9iyGrBoydDAKt6xq5VGVVkvyVZ1u5obFEtwDwEyUqwoajQcx2u4E8EVebCx6AF9kuElwWxq4VEjzpENa36m2Ki2q7Ujw08bG00X38gw25oK02V902n9204txW3S04Fp8mz80C62y1o80s5Cy80hIyEbBtzEy9gKP0cS1txh1vyC0o5w3UXw0mXE0vnw3t6'
const BLOKS_FALLBACK = '6f67afab2ded7036fdc88f8690840e9e2773662e6fb25cc5a1a1a7de303e7c0c'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const RELAY_VARS = {
  __relay_internal__pv__PolarisImmersiveFeedChainingEnabledrelayprovider: true,
  __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
  __relay_internal__pv__PolarisAIGMAccountLabelEnabledrelayprovider: false,
  __relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider: false,
}

function extractTokens(html) {
  const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1]
  const fbDtsg =
    html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
    html.match(/"token":"(NAf[^"]+)"/)?.[1] ??
    null
  const csrf = html.match(/"csrf_token":"([^"]+)"/)?.[1]
  const hs = html.match(/"haste_session":"([^"]+)"/)?.[1] ?? ''
  const rev = html.match(/"client_revision":(\d+)/)?.[1] ?? '1042292244'
  const hsi = html.match(/"hsi":"(\d+)"/)?.[1] ?? html.match(/hsi.*?(\d{16,})/)?.[1] ?? ''
  const actorID =
    html.match(/"actorID":"(\d+)"/)?.[1] ??
    html.match(/"actor_id":"(\d+)"/)?.[1] ??
    '17841405620559862'
  const bloksVersion = html.match(/"bloks_version_id":"([a-f0-9]{64})"/)?.[1] ?? BLOKS_FALLBACK
  return { lsd, fbDtsg, csrf, hs, rev, hsi, actorID, bloksVersion }
}

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? []
  return raw.map((c) => c.split(';')[0]).join('; ')
}

/** Retorna tokens cacheados o hace un nuevo fetch del HTML del perfil. */
async function getOrFetchTokens() {
  if (TOKEN_CACHE.tokens && Date.now() - TOKEN_CACHE.ts < TOKEN_TTL) {
    return { tokens: TOKEN_CACHE.tokens, cookies: TOKEN_CACHE.cookies }
  }
  const profileRes = await fetch(`https://www.instagram.com/${IG_USERNAME}/`, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Upgrade-Insecure-Requests': '1',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!profileRes.ok) throw new Error(`No se pudo cargar el perfil: ${profileRes.status}`)
  const cookies = parseCookies(profileRes)
  const html = await profileRes.text()
  const tokens = extractTokens(html)
  if (!tokens.lsd || !tokens.fbDtsg) throw new Error('No se pudieron extraer los tokens.')
  TOKEN_CACHE.ts = Date.now()
  TOKEN_CACHE.tokens = tokens
  TOKEN_CACHE.cookies = cookies
  return { tokens, cookies }
}

async function callApi({ lsd, fbDtsg, csrf, hs, rev, hsi, actorID, bloksVersion, cookies }, docId, variables) {
  const friendly =
    docId === DOC_ID_FIRST ? 'PolarisProfilePostsQuery' : 'PolarisProfilePostsTabContentQuery_connection'

  const body = new URLSearchParams({
    av: actorID ?? '17841405620559862',
    __d: 'www', __user: '0', __a: '1', __req: '6',
    __hs: hs || '20633.HYP:instagram_web_pkg.2.1...0',
    dpr: '1', __ccg: 'EXCELLENT',
    __rev: rev || '1042292244',
    __s: 'vs37v7:mfjwb9:f513vl',
    __hsi: hsi || '7656818550421134402',
    __dyn: IG_DYN, __csr: IG_CSR, __comet_req: '7',
    fb_dtsg: fbDtsg ?? '', jazoest: '26406', lsd: lsd ?? '',
    __spin_r: rev || '1042292244', __spin_b: 'trunk',
    __spin_t: String(Math.floor(Date.now() / 1000)),
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: friendly,
    server_timestamps: 'true',
    variables: JSON.stringify(variables),
    doc_id: docId,
  }).toString()

  const res = await fetch('https://www.instagram.com/graphql/query', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      Cookie: cookies ?? '',
      'x-csrftoken': csrf ?? '',
      'x-fb-lsd': lsd ?? '',
      'x-fb-friendly-name': friendly,
      'x-asbd-id': '359341',
      'x-bloks-version-id': bloksVersion ?? BLOKS_FALLBACK,
      'x-instagram-ajax': rev || '1042292244',
      Origin: 'https://www.instagram.com',
      Referer: `https://www.instagram.com/${IG_USERNAME}/`,
    },
    body,
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Instagram API error: ${res.status}`)
  const text = await res.text()
  const clean = text.startsWith('for (;;);') ? text.slice('for (;;);'.length) : text
  return JSON.parse(clean)
}

function nodeToPost(node) {
  const type = node.media_type === 2 ? 'video' : node.media_type === 8 ? 'carousel' : 'image'
  const cands = node.image_versions2?.candidates ?? []
  const thumb = (cands.find((c) => c.width <= 720) ?? cands[0])?.url ?? ''
  return {
    id: node.pk,
    code: node.code,
    type,
    thumb,
    takenAt: node.taken_at,
    url: `https://www.instagram.com/p/${node.code}/`,
    caption: node.caption?.text ?? '',
  }
}

/** Obtiene una página de posts. `afterCursor` null = primera página. */
export async function fetchInstagramPage(afterCursor = null) {
  const { tokens, cookies } = await getOrFetchTokens()

  const dataVars = {
    count: PER_PAGE,
    include_reel_media_seen_timestamp: true,
    include_relationship_info: true,
    latest_besties_reel_media: true,
    latest_reel_media: true,
  }

  let result
  if (!afterCursor) {
    result = await callApi({ ...tokens, cookies }, DOC_ID_FIRST, {
      data: dataVars,
      username: IG_USERNAME,
      ...RELAY_VARS,
    })
  } else {
    result = await callApi({ ...tokens, cookies }, DOC_ID_PAGED, {
      data: dataVars,
      username: IG_USERNAME,
      ...RELAY_VARS,
      after: afterCursor,
      before: null,
      first: PER_PAGE,
      last: null,
    })
  }

  const conn = result?.data?.xdt_api__v1__feed__user_timeline_graphql_connection
  if (!conn?.edges) throw new Error(`API inesperada: ${JSON.stringify(result).substring(0, 400)}`)

  return {
    posts: conn.edges.map((e) => nodeToPost(e.node)),
    nextCursor: conn.page_info?.end_cursor ?? null,
    hasMore: conn.page_info?.has_next_page ?? false,
  }
}
