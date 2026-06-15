// =============================================================
// relay/main.ts — OpenRouter Tokyo (nrt) relay
// =============================================================
// Supabase Edge Functions egress from a region OpenRouter geo-blocks: every call
// returns `403 "The request is prohibited due to a violation of provider Terms Of
// Service"` with provider_name:null — i.e. rejected at OpenRouter's gateway BEFORE
// any provider, regardless of which (valid, funded) key is used. Proven by a
// known-good key still 403-ing from Supabase.
//
// This Fly app is pinned to primary_region = nrt (Tokyo), so it re-originates the
// request from a Japan IP — exactly how our other project (michel-bot, Fly nrt)
// dodges the block. It is a thin pass-through:
//   1. require the shared x-relay-secret (so it isn't an open region-laundering proxy)
//   2. strip that header, forward method + remaining headers + body to openrouter.ai
//   3. stream the SSE response straight back
// The OpenRouter API key never lives here — it stays in Supabase and rides through
// in the Authorization header.
// =============================================================

const UPSTREAM = 'https://openrouter.ai'
const SECRET = Deno.env.get('RELAY_SECRET') ?? ''

// Hop-by-hop / injected headers we must not forward verbatim.
const DROP = new Set(['host', 'x-relay-secret', 'content-length', 'connection'])

Deno.serve({ port: 8000 }, async (req) => {
  const url = new URL(req.url)

  // Health check (Fly http checks hit "/").
  if (req.method === 'GET' && url.pathname === '/') {
    return new Response('ok', { status: 200 })
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  // Gate: only callers holding the shared secret may use the relay.
  if (!SECRET || req.headers.get('x-relay-secret') !== SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  const headers = new Headers()
  for (const [k, v] of req.headers) {
    if (!DROP.has(k.toLowerCase())) headers.set(k, v)
  }

  // Body is small JSON (chat messages) — read it fully so we don't need a duplex
  // streaming request body (avoids runtime quirks); fetch recomputes Content-Length.
  const body = await req.text()
  let reqModel = '?'
  try { reqModel = JSON.parse(body).model ?? '?' } catch { /* ignore */ }

  const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
    method: 'POST',
    headers,
    body,
  })
  console.log(`[relay] model=${reqModel} -> openrouter ${upstream.status}`)

  // Pass the upstream body straight through (SSE stream when stream:true).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-cache',
    },
  })
})
