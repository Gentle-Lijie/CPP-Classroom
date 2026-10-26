// Keep browser sessions on the Makers origin; business logic stays on ssh b.
export default async function onRequest({ request, env }) {
  const fail = (status, message) =>
    new Response(JSON.stringify({ message }), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  const incoming = new URL(request.url)
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  if (mutation) {
    const origin = request.headers.get('origin')
    if (
      (origin && origin !== incoming.origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return fail(403, '请求来源不匹配')
  }
  let origin
  try {
    origin = new URL(env?.API_ORIGIN || 'https://cpp-backend.lijie.space')
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      origin.origin === incoming.origin
    )
      throw new Error('Invalid API_ORIGIN')
  } catch {
    return fail(503, '请配置后端 HTTPS API_ORIGIN')
  }
  // Concatenate validated origin and pathname: a // path must never select a new host.
  const target = origin.origin + incoming.pathname + incoming.search
  const headers = new Headers(request.headers)
  for (const name of [...headers.keys()]) {
    if (
      ['host', 'connection', 'content-length', 'forwarded', 'accept-encoding'].includes(name) ||
      name.startsWith('x-forwarded-') ||
      name.startsWith('sec-fetch-')
    )
      headers.delete(name)
  }
  // EdgeOne's subrequest runtime must receive the upstream virtual host
  // explicitly; inheriting the site's Host can hit the origin's default vhost.
  headers.set('host', origin.host)
  if (headers.has('origin')) headers.set('origin', origin.origin)
  headers.set('accept-encoding', 'identity')
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      ...(request.method === 'GET' || request.method === 'HEAD'
        ? {}
        : { body: await request.arrayBuffer() }),
    })
    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.set('Cache-Control', 'no-store')
    // The browser always reaches this gateway over HTTPS, even behind another proxy.
    const cookie = responseHeaders.get('set-cookie')
    if (cookie && !/;\s*secure(?:;|$)/i.test(cookie))
      responseHeaders.set('set-cookie', cookie + '; Secure')
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch {
    return fail(502, '后端连接失败，请稍后重试')
  }
}
