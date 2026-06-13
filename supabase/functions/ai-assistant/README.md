# ai-assistant — Edge Function (AI 站長)

Per-project AI assistant. Runs the model's tool-use loop **as the calling user**
(forwarded JWT → RLS-bounded). See `.planning/ai-form-2026/AI-ASSISTANT-PLAN.md`.

## Status
- **Phase 0 (this commit):** skeleton — auth, `ai_enabled_for_project` gate, daily
  budget gate, SSE relay, one `ping` tool proving JWT-forwarding + usage recording.
- Phase 1 adds the real read tools + the sonnet/opus router; Phase 2 the
  mutate-tool confirm pause.

## Deploy (your side — needs Supabase login/credentials)
```bash
# 1) set the model-provider secret (default provider = anthropic)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  --project-ref syyntodkvexkbpjrskjj
#    optional — route through OpenRouter instead:
# supabase secrets set AI_PROVIDER=openrouter OPENROUTER_API_KEY=sk-or-... --project-ref syyntodkvexkbpjrskjj
#    (OpenRouter adapter lands in Phase 1; Anthropic is the working default.)

# 2) deploy (KEEP JWT verification ON — the function needs the user JWT)
supabase functions deploy ai-assistant --project-ref syyntodkvexkbpjrskjj
```
`SUPABASE_URL` / `SUPABASE_ANON_KEY` are injected by the platform — do not set them.
The Anthropic key lives only in Edge secrets, never in any `VITE_*`.

## Enable for a pilot project (after deploy)
```sql
select set_ai_assistant_enabled(true);              -- global master switch (admin)
select set_project_ai_enabled('<project_id>', true); -- per-project opt-in (admin/PM)
```
Both must be true; the function checks `ai_enabled_for_project()` first.

## Files
- `index.ts` — handler: CORS, auth, gates, SSE, the manual tool loop.
- `provider.ts` — `streamAssistant()`; Anthropic Messages API (reference) +
  OpenRouter adapter slot, selected by `AI_PROVIDER`.

## Contract (client → function)
`POST {SUPABASE_URL}/functions/v1/ai-assistant`
`Authorization: Bearer <user access token>`
body: `{ project_id, messages: [{role, content}], model? }`
→ `text/event-stream`: `event: text|tool|done|error`.
