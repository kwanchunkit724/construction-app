# OpenRouter Tokyo relay (`ck-or-relay-nrt`)

Thin pass-through that re-originates OpenRouter calls from **Tokyo (Fly `nrt`)**.

## Why

Supabase Edge Functions egress from a region OpenRouter geo-blocks — every call
returns `403 "The request is prohibited due to a violation of provider Terms Of
Service"` (`provider_name: null`, i.e. blocked at OpenRouter's gateway before any
provider). Proven by a **known-good, funded key** still 403-ing from Supabase, so
it is the *egress region*, not the key. Our other project (michel-bot) avoids this
by calling from Fly Tokyo. This relay does the same for the construction app.

```
Supabase Edge Function (ai-assistant)
  --> https://ck-or-relay-nrt.fly.dev/api/v1/chat/completions   (x-relay-secret)
        --> https://openrouter.ai/api/v1/chat/completions        (Tokyo IP)
```

The OpenRouter API key never lives here; it stays in Supabase and rides through in
`Authorization`. The relay only adds a Tokyo egress + a shared-secret gate.

## Deploy

```bash
# from this directory
fly apps create ck-or-relay-nrt          # one-time (pick a free global name if taken)
fly secrets set RELAY_SECRET=<secret> -a ck-or-relay-nrt
fly deploy --remote-only -a ck-or-relay-nrt
```

`RELAY_SECRET` must match the `RELAY_SECRET` set on the Supabase function.

## Wire the Supabase function

Set these Edge Function secrets (Dashboard → Edge Functions → Secrets):

| Secret | Value |
|---|---|
| `OPENROUTER_BASE_URL` | `https://ck-or-relay-nrt.fly.dev` |
| `RELAY_SECRET` | same value as the Fly secret |

`provider.ts` reads `OPENROUTER_BASE_URL` (default `https://openrouter.ai`) and adds
`x-relay-secret` only when `RELAY_SECRET` is set. To go back to direct OpenRouter (or
switch `AI_PROVIDER=anthropic`), unset `OPENROUTER_BASE_URL`.

## Health

`GET /` → `200 ok`.
