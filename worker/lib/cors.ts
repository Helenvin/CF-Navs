import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../types'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '600',
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const corsHeaders: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next()
  const headers = new Headers(c.res.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value)
  c.res = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers })
}
