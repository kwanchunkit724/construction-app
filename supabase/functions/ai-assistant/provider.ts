// =============================================================
// supabase/functions/ai-assistant/provider.ts
// =============================================================
// Provider-swappable streaming tool-use, selected by AI_PROVIDER:
//   'anthropic'  (default) — Anthropic Messages API, native tool-use + SSE
//   'openrouter'           — OpenAI-compatible /chat/completions (adapter)
// One interface for index.ts: streamAssistant(). The Anthropic path is the
// reference implementation; the OpenRouter adapter translates to/from the
// OpenAI tool-call shape. Raw fetch (no SDK) keeps the Edge bundle tiny and the
// two providers behind one seam.
// =============================================================

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export interface ChatMessage { role: 'user' | 'assistant'; content: string | ContentBlock[] }
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }
export interface ToolUse { id: string; name: string; input: unknown }

export interface StreamResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | string
  toolUses: ToolUse[]
  assistantContent: ContentBlock[]   // raw blocks, for replay on the next turn
  usage: { input: number; output: number }
}

export interface StreamArgs {
  system: string
  messages: ChatMessage[]
  tools: ToolDef[]
  model: string
  maxTokens?: number
  onText: (delta: string) => void
}

const PROVIDER = (Deno.env.get('AI_PROVIDER') ?? 'anthropic').toLowerCase()

export function streamAssistant(args: StreamArgs): Promise<StreamResult> {
  if (PROVIDER === 'openrouter') return streamOpenRouter(args)
  return streamAnthropic(args)
}

// ── Anthropic Messages API (reference) ───────────────────────────────────────
async function streamAnthropic(a: StreamArgs): Promise<StreamResult> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY 未設定')

  // Stable prefix (system + tools) carries a cache breakpoint → ~0.1x reads
  // across the loop's iterations (AI-ASSISTANT-PLAN §4.2).
  const tools = a.tools.map((t, i) =>
    i === a.tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: a.model,
      max_tokens: a.maxTokens ?? 4096,
      stream: true,
      system: [{ type: 'text', text: a.system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: a.messages,
    }),
  })
  if (!res.ok || !res.body) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => '')}`)

  const blocks: ContentBlock[] = []
  const toolJson: Record<number, string> = {}   // index -> accumulating input json
  let stopReason = 'end_turn'
  let usageIn = 0, usageOut = 0

  await readSSE(res.body, (event, data) => {
    if (event === 'content_block_start') {
      const b = data.content_block
      if (b.type === 'text') blocks[data.index] = { type: 'text', text: '' }
      else if (b.type === 'tool_use') { blocks[data.index] = { type: 'tool_use', id: b.id, name: b.name, input: {} }; toolJson[data.index] = '' }
    } else if (event === 'content_block_delta') {
      if (data.delta.type === 'text_delta') {
        a.onText(data.delta.text)
        const blk = blocks[data.index] as { type: 'text'; text: string }
        if (blk) blk.text += data.delta.text
      } else if (data.delta.type === 'input_json_delta') {
        toolJson[data.index] = (toolJson[data.index] ?? '') + data.delta.partial_json
      }
    } else if (event === 'content_block_stop') {
      const blk = blocks[data.index]
      if (blk && blk.type === 'tool_use') { try { blk.input = JSON.parse(toolJson[data.index] || '{}') } catch { blk.input = {} } }
    } else if (event === 'message_delta') {
      if (data.delta?.stop_reason) stopReason = data.delta.stop_reason
      if (data.usage?.output_tokens) usageOut = data.usage.output_tokens
    } else if (event === 'message_start') {
      usageIn = data.message?.usage?.input_tokens ?? 0
    }
  })

  const assistantContent = blocks.filter(Boolean)
  const toolUses = assistantContent.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }))
  return { stopReason, toolUses, assistantContent, usage: { input: usageIn, output: usageOut } }
}

// ── OpenRouter (OpenAI-compatible) adapter ───────────────────────────────────
// OpenRouter speaks the OpenAI /chat/completions shape (tool_calls), not the
// Anthropic blocks shape. This adapter is stubbed for Phase 0: implement the
// message<->OpenAI translation + SSE tool_call assembly in Phase 1 if the user
// chooses OpenRouter. Anthropic remains the default and needs nothing here.
function streamOpenRouter(_a: StreamArgs): Promise<StreamResult> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new Error('OPENROUTER_API_KEY 未設定')
  throw new Error('AI_PROVIDER=openrouter 嘅 adapter 仲未實作（Phase 1）。暫時用 anthropic。')
}

// ── minimal SSE line reader ──────────────────────────────────────────────────
async function readSSE(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: any) => void) {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let event = 'message'
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim()
        if (raw && raw !== '[DONE]') { try { onEvent(event, JSON.parse(raw)) } catch { /* ignore keepalives */ } }
      } else if (line === '') event = 'message'
    }
  }
}
