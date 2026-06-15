---
title: Obsidian Memory-Graph Integration & Upgrade Proposal
project: CK工程 / Construction App
status: proposal
date: 2026-06-15
audience: solo developer (KCK) + future AI 站長 maintainers
stack: React 19 + TS + Vite + Tailwind 3.4 + Capacitor 8 + Supabase (LOCKED — no rewrites)
---

# Obsidian Memory-Graph Integration & Upgrade Proposal

> **One-paragraph thesis.** The CK app already has two unrelated "memory" systems — the
> developer-side `.claude/.../memory/*.md` notes (already a hand-rolled wikilinked vault) and
> the app's AI 站長, which has *zero* structured memory and re-derives everything from RLS reads
> every turn. Obsidian gives us a near-free, local-first **linked-markdown knowledge graph** that
> can (a) properly host the dev-memory vault today, and (b) become an exported, traversable
> mirror of each project's entities (progress ↔ documents ↔ issues ↔ materials ↔ decisions ↔
> permits) that AI 站長 can read to answer cross-entity questions without N tool calls. Crucially,
> **Supabase stays the single source of truth** — Obsidian is a derived, read-mostly graph, so
> nothing in the LOCKED stack changes.

---

## 1. The Problem

### 1.1 Two disconnected memory systems, neither is a graph

| System | What it is today | Gap |
|---|---|---|
| **Dev-memory** (`C:\Users\user\.claude\projects\…\memory\*.md`) | `MEMORY.md` index + 6 notes, YAML frontmatter (`node_type: memory`, `type`, `originSessionId`), inline `[[wikilinks]]` into other notes + `.claude/skills/*` | Links are **untyped and one-directional in practice**; no backlinks, no orphan detection, no tag faceting, no graph view. Notes carry stale "13 days old" / `file:line` warnings that drift silently. |
| **AI 站長 runtime memory** (`supabase/v56-ai-assistant.sql`) | `ai_conversations` + `ai_messages` (flat Anthropic content-block transcript), `ai_actions` (proposal/provenance, hash-chained into `audit_ledger`), `ai_usage` (token budget) | **No semantic/knowledge memory, no embeddings, no notes/links table, no entity model.** The AI re-queries flat rows each turn, has no cross-conversation recall beyond raw messages, and cannot record "facts learned about this site" persistently. |

### 1.2 The AI re-derives the world every turn

AI 站長 (`supabase/functions/ai-assistant/index.ts`) runs an Anthropic/OpenRouter tool-use loop
**as the calling user** (forwarded JWT → RLS-bounded reads/writes). Its 11 read tools (`tools.ts`)
each hit live tables capped at 60 rows. It has **no model** of "this 判頭 handles this zone,"
"this material order keeps slipping," "drawing v3 supersedes v2," or "the crane is down until
Friday." Every cross-entity question ("what's blocking 3/F and who owns it?") costs multiple
sequential tool calls and re-reasoning, and any qualitative fact the user states is lost the moment
the conversation ends.

### 1.3 The latent graph already exists in SQL — nothing traverses it

The data is *already* a graph in Postgres via foreign keys:

```
progress_item ──< drawing/document ──< document_version (supersede chain, legacy_drawing_id)
      │                                        │
      ├──< issue ──< issue_comment             └── document_events (append-only audit)
      ├──< material_order
      ├──< event (timetable)
      └── assigned_to[] / delegated_to[] ──> user_profiles ──< project_members ──> projects
```

No tool walks `document_events` / supersede chains / `progress_item_id` attachments as a graph.
The audit trail (`ai_actions` → `audit_ledger`) — the app's **core dispute-survival value prop** —
is hash-chained but not navigable.

### 1.4 What we want

A **persistent, linkable memory/knowledge graph** that:
1. Properly hosts the dev-memory vault (backlinks, orphans, tags, graph view) — *cheap, today*.
2. Gives AI 站長 a structured, traversable mirror of each project so it answers cross-entity
   questions in one read instead of N tool calls.
3. Adds durable **site-facts memory** that survives conversation boundaries.
4. Surfaces the document/drawing version lineage and the audit/provenance chain as a graph.
5. Does **all of the above without touching the LOCKED stack** (React+Supabase+Capacitor, no
   rewrites, backwards-compatible migrations only).

---

## 2. What Obsidian Offers — and Its Limits Here

### 2.1 The properties that matter for us

- **A vault is just a folder of plain `.md` files.** Local-first, no proprietary DB. Any language
  that writes UTF-8 can populate it. **This is the single most important property:** the data layer
  is independent of Obsidian — Obsidian is one viewer over a folder our exporter writes.
- **Free, emergent graph.** Write `[[X]]` and the node + edge exist; every wikilink auto-creates a
  **backlink**. `[[Note#Heading]]`, `[[Note^block]]`, `[[Note|alias]]`, embeds `![[Note]]`.
  **Unlinked mentions** let an agent promote plain text into real edges.
- **Typed structured layer = YAML frontmatter Properties.** Native types: text, number, checkbox,
  date, datetime, list, **links**. A link *inside* frontmatter (`manager: "[[Alice Wong]]"`) is both
  a typed field and a graph edge — exactly the "relational rows as notes" pattern (one note = one
  entity; frontmatter = columns; wikilinks = foreign keys; `#type` tags = class).
- **Dataview** turns the vault into a queryable store (`TABLE status FROM #issue WHERE …`) — but
  queries render *inside Obsidian*, not over the wire (see limits).
- **Local REST API plugin** (`https://127.0.0.1:27124/`, bearer token) gives HTTP CRUD plus the
  key feature for a memory store: **surgical `PATCH`** by `Target-Type: heading|block|frontmatter`
  (append/prepend/replace **one** field without rewriting the file → conflict-safe). Includes
  `/search/` (JsonLogic + DQL), `/periodic/...` (episodic journal), and a **built-in MCP server**
  at `/mcp/`.
- **Smart Connections** adds **local embeddings** (bundled `bge-micro-v2`, 384-dim, offline, no API
  key) → a *similarity* edge type layered on the explicit wikilink graph.
- **Karpathy "LLM Wiki" pattern** (`ar9av/obsidian-wiki`) is the proven reference: atomic
  note-per-entity, `summary:` frontmatter for **tiered retrieval** (titles → tags → summaries →
  bodies), `provenance:` (`extracted`/`inferred`/`ambiguous`), `.manifest.json` **delta tracking**
  for idempotent re-runs, and a read/write **merge** loop (update-if-present, create-if-novel).

### 2.2 Limits that constrain *our* design (and how we dodge them)

| Limit | Impact on CK | Mitigation in this proposal |
|---|---|---|
| **Links are name/path-based, not stable IDs.** Direct file writers own link integrity on rename. | Our entities have stable UUIDs; a renamed project would rot links. | **Use the UUID as the note filename/slug** (`progress-<uuid>.md`) and put the human name in `aliases:`. Links never rename. |
| **No transactional DB guarantees**; concurrent writers race. | Exporter + Obsidian + sync could collide. | **Single authoritative writer** (the exporter). Obsidian/AI read-mostly. Idempotent writes keyed by a `.manifest.json` delta. Surgical `PATCH` for the few write-back fields. |
| **REST API needs a *running* Obsidian** — not headless/serverless. | A Supabase Edge Function (cloud, stateless) **cannot** call the localhost REST API. | The **export job and the AI read both go through plain files + Git**, not the REST API. REST API is an *optional desktop convenience* for the developer, never on the AI's hot path. |
| **Dataview/graph compute lives inside Obsidian.** | The Edge Function won't get Dataview tables. | AI reads the **raw markdown + frontmatter** (cheap to parse) or a pre-built JSON index we generate alongside the vault. |
| **Mobile is the weak link** (Git isomorphic-git limits; localhost REST awkward on phones). | Capacitor app is mobile-first. | The vault is a **developer/back-office artifact**, NOT shipped inside the Capacitor bundle. End users never see Obsidian. No mobile dependency introduced. |
| **"Memory" needs active curation** (dedup/merge/cross-link), not append-only dumps. | Naive export = link rot + orphans. | Exporter does **merge + cross-link + orphan/manifest** passes; site-facts get `provenance:` + `verified:` fields. |
| **Scale**: one-note-per-fact explodes file counts. | A busy site = thousands of issues/events. | Export **entities** (bounded: progress items, documents, contacts, decisions) as notes; keep **high-cardinality rows** (every comment/event) as embedded lists/sections inside the parent entity note, not separate files. |

**Net:** Obsidian is a great *derived graph + dev-memory host*. It is **not** a system of record and
**not** something we put on the user's phone. Both constraints are load-bearing for the LOCKED stack.

---

## 3. Architecture Options — Linking Obsidian to the Supabase System

Design rule for all options: **Supabase = source of truth; Obsidian = derived, read-mostly mirror.**

### 3.1 Vault layout (shared by all options)

```
ck-vault/
  _meta/
    taxonomy.md            # controlled-vocabulary tags + node_type list
    INDEX.md               # Dataview dashboards (orphans, stale, per-project rollups)
    .manifest.json         # delta record: source row → note → hash → exported_at
  projects/
    project-<uuid>.md      # frontmatter: name(alias), zones[], assigned_pm_ids[] as [[links]]
  progress/
    progress-<uuid>.md     # code, title, zone, status, actual/planned %, links to docs/issues
  documents/
    document-<uuid>.md      # doc_number, type, status, supersede chain as [[links]], event log
  issues/
    issue-<uuid>.md         # reporter/handler role, status, escalation chain, comments (embedded)
  contacts/
    contact-<uuid>.md       # trade, phone, links to issues/materials they touch
  decisions/
    decision-<uuid>.md      # SI/VO/PTW approval-chain decisions, who proposed → who confirmed
  ai-facts/
    fact-<uuid>.md          # durable site-facts: "crane down until Fri", provenance + verified
  audit/
    action-<uuid>.md        # ai_actions proposal → confirm → RLS-allowed (from audit_ledger)
```

Each entity note (the "relational row as a note"):

```markdown
---
node_type: entity
type: progress_item
uuid: 8f3c…                       # stable; also the filename slug
aliases: ["3/F 結構 — 鋼筋綁紮"]    # human name; links survive rename
project: "[[project-<uuid>]]"
zone_id: Z-03
status: blocked
actual_progress: 40
planned_progress: 65
blocking_issue: "[[issue-<uuid>]]"
governing_drawing: "[[document-<uuid>]]"
owner: "[[contact-<uuid>]]"
summary: "3/F 鋼筋綁紮卡在 RFI；落後 25%，等則師回覆。"   # tiered-retrieval preview
provenance: extracted
source_updated_at: 2026-06-15T09:12:00+08:00
tags: [progress_item, blocked, zone/Z-03]
---

## History (embedded, not separate files)
- 2026-06-14 40% — last_updated_by [[contact-<uuid>]] — "等 RFI-012"
```

### 3.2 Option A — **One-way export, file + Git** (RECOMMENDED CORE)

A scheduled job reads Supabase and writes/updates the vault files, then `git commit`s.

- **Where it runs:** a **Supabase Edge Function on a cron** (`export-vault`) that writes to a Git
  repo it owns, **or** a small Node script the developer runs on the desktop/CI. Either way it talks
  to Supabase with the **service-role key** (read-only queries) — *not* through Obsidian's REST API,
  so it works headless.
- **Idempotency:** `.manifest.json` records `source_pk → note_path → content_hash → exported_at`;
  re-runs only rewrite changed entities (delta tracking, Karpathy pattern).
- **Link integrity:** UUID slugs (3.1) → renames never rot links; human names live in `aliases:`.
- **Cross-link pass:** after writing entities, a pass converts FK references and unlinked mentions
  into `[[wikilinks]]`, then runs orphan detection and writes `_meta/INDEX.md` Dataview dashboards.
- **Durability/audit:** Git gives a diffable, timestamped history of how the site's knowledge graph
  evolved — which doubles as a *second* audit artifact alongside `audit_ledger`.
- **Pros:** headless, language-agnostic, no running Obsidian required, conflict-free (single writer),
  cheapest to build, zero stack changes, end users never touch it.
- **Cons:** not real-time (cron/interval); one-way (writes from app → vault; see Option C for the
  thin write-back).

> This is the backbone. Everything else layers on top.

### 3.3 Option B — **Local REST API plugin** (DEVELOPER DESKTOP CONVENIENCE ONLY)

Run Obsidian + the Local REST API plugin on the developer's machine.

- **Use it for:** the *developer's* interactive editing of the dev-memory vault and ad-hoc surgical
  `PATCH` writes (e.g. flipping a `verified:` flag), plus the built-in **MCP server** so **Claude
  Code** (this assistant) can read/write the vault during dev sessions.
- **Do NOT use it for:** the app's AI 站長 hot path. The Edge Function is cloud + stateless and
  cannot reach `127.0.0.1:27124`. Putting REST on the AI path would violate the "headless" reality.
- **Pros:** surgical, conflict-safe single-field edits; turnkey MCP for Claude Code; no bespoke HTTP.
- **Cons:** requires a running desktop Obsidian; not available to the deployed app; self-signed cert.

### 3.4 Option C — **Thin write-back** (OPTIONAL, LATER)

For the *few* fields the AI/developer should write back into Supabase (mainly **site-facts** and a
`verified` toggle), don't write Postgres from Obsidian. Instead:

- The **AI proposes** a fact via a *mutate tool* (`record_site_fact`, §4) that follows the existing
  **confirm-card → `ai_actions(status='proposed')` → human confirm** flow. On confirm it writes to a
  new `ai_facts` table (RLS-bounded exactly like `ai_conversations`, owner/project-scoped).
- The **export job** then mirrors `ai_facts` into `ai-facts/fact-<uuid>.md` on its next run.

This keeps **all writes inside the existing RLS + confirm-card + audit-ledger discipline** — Obsidian
never writes the database. (New table only → backwards-compatible per CLAUDE.md constraints.)

### 3.5 Option D — **Semantic layer** (OPTIONAL ENHANCEMENT)

Layer Smart Connections (local `bge-micro-v2` embeddings) over the vault for fuzzy recall, **or**
generate an embedding index alongside the export and store vectors in Supabase `pgvector`. The
explicit wikilink graph stays the precise layer; embeddings add "find similar past situations."
Only worth it once the vault has real density (Phase 3+).

### 3.6 Sync & hosting decision

| Concern | Decision | Why |
|---|---|---|
| **Sync mechanism** | **Git + Obsidian Git plugin** (auto-commit interval) | App-friendly: audit trail, diffable, idempotent commits, conflict surfacing. Matches `supabase-migration-apply` "verify by execution" discipline. |
| **Do NOT** | stack a second sync service on the same vault | Two sync mechanisms on one vault → corruption (documented). |
| **Mobile** | **none** — vault is back-office only | Avoids isomorphic-git mobile crashes + localhost-REST-on-phone problems entirely. End users stay on the Capacitor app. |
| **Hosting** | private Git repo (GitHub private / the existing repo under `.planning/` or a sibling) | Already have Git; no new infra, no new cost. |
| **Dev-memory vault** | point Obsidian at `C:\Users\user\.claude\projects\…\memory\` **and** `.claude\skills\` as one vault | Connects lessons to the harnesses that produced them (`[[daily-site-sim]]`, `[[supabase-migration-apply]]`) for free. |

---

## 4. How AI 站長 Reads / Traverses the Graph (New Tools)

The AI never calls Obsidian's REST API (cloud/stateless reality). It reads the **exported markdown
+ frontmatter** (or a generated JSON index) committed to Git, fetched by the Edge Function. New
**read tools** mirror the existing `tools.ts` conventions (RLS-narrowed, ≤60 rows, column-trimmed)
and are added to the same tool-use loop in `index.ts`:

| New read tool | What it does | Why it beats today |
|---|---|---|
| `graph_neighbors(entity_uuid, edge_types?)` | Returns the 1-hop neighborhood of any entity (its linked docs/issues/materials/contacts/decisions) from the vault graph | One call answers "what's connected to 3/F" instead of N sequential reads |
| `traverse_blocking(progress_uuid)` | Walks `blocking_issue → handler → owner` and `governing_drawing` edges | Answers "what's blocking X and who owns it" in a single traversal |
| `document_lineage(document_uuid)` | Walks the supersede chain + `legacy_drawing_id` + `progress_item_id` attachment | Exposes version lineage no current tool surfaces |
| `recall_site_facts(project_id, query?)` | Tiered retrieval over `ai-facts/` (titles → tags → `summary:` → body) | Durable cross-conversation recall ("crane down until Fri") — impossible today |
| `audit_trace(action_uuid)` | Walks `audit/` notes: proposed-by → confirmed-by → RLS-allowed | Makes the dispute-survival audit navigable |

Plus **one mutate tool** (Option C, follows the existing confirm-card/`ai_actions` discipline, never
auto-runs, RLS-bounded, exposed only to appropriate roles via `exposedMutateTools(role)`):

| New mutate tool | What it does |
|---|---|
| `record_site_fact(project_id, body, links[])` | Proposes a durable site-fact → confirm-card → writes `ai_facts` row → mirrored to vault on next export |

**Retrieval discipline:** the AI uses **tiered retrieval** — it reads note titles + tags +
`summary:` frontmatter first (cheap, token-bounded) and only opens full bodies when needed. This is
exactly why `summary:` is mandatory in the export schema (§3.1).

**Security invariants preserved:** all new reads stay RLS-narrowed (the exporter must itself respect
visibility — see Risk R3); the new mutate stays behind the confirm-card + `step_up` + `audit_ledger`
walls. No tool gains a capability the human lacks.

---

## 5. Phased Upgrade Roadmap (MVP → Full)

Numbering follows the project's semantic-version migration convention; no timestamps.

### Phase 0 — Dev-memory vault (½ day, near-zero risk) ✅ cheapest win
- Open the existing `memory\` + `.claude\skills\` folders as a single Obsidian vault.
- Add `_meta/taxonomy.md` (controlled `node_type`/`type` vocab) and an `INDEX.md` with Dataview
  dashboards: **orphans**, **stale notes** (frontmatter `source/date` older than N days), backlink
  counts.
- Install Obsidian Git (auto-commit) + optionally Local REST API for Claude Code MCP access.
- **Outcome:** backlinks, orphan detection, tag faceting, graph view, staleness surfacing — today,
  with no app changes.

### Phase 1 — One-way entity export MVP (1–2 days)
- Build `export-vault` (Node script first; promote to cron Edge Function later).
- Export **projects + progress items + documents** only, UUID-slugged, with `summary:`/`provenance:`
  frontmatter and FK→`[[wikilink]]` edges. Write `.manifest.json` delta record. Commit to a private
  Git repo.
- **Verify by execution** (per `supabase-migration-apply`): re-run is idempotent (no spurious diffs);
  graph view shows progress↔document↔project edges; renaming a project doesn't rot links.
- **Outcome:** a real, navigable per-project graph mirror for the developer.

### Phase 2 — AI read tools over the graph (2–3 days)
- Add `graph_neighbors`, `traverse_blocking`, `document_lineage` to `tools.ts` + the loop in
  `index.ts`. Edge Function pulls the committed vault/JSON index (read-only).
- Run the **daily-site-sim** harness to confirm cross-entity answers now take 1 read, and that RLS
  narrowing still holds (an agent only sees its visible slice).
- **Outcome:** AI answers "what's blocking 3/F and who owns it" without N tool calls.

### Phase 3 — Durable site-facts memory (2 days)
- New `ai_facts` table (RLS like `ai_conversations`; new table only → backwards-compatible).
- Add `record_site_fact` mutate (confirm-card flow) + `recall_site_facts` read. Export mirrors facts
  into `ai-facts/`.
- **Outcome:** AI remembers stated facts across conversations, with provenance + audit.

### Phase 4 — Audit & decision graph + semantic layer (2–3 days)
- Export `ai_actions`/`audit_ledger` into `audit/` and SI/VO/PTW decisions into `decisions/`;
  add `audit_trace`.
- Optional: Smart Connections embeddings or `pgvector` index for fuzzy recall.
- **Outcome:** navigable dispute-survival audit graph + similarity recall.

### Phase 5 — Maintenance jobs (ongoing)
- Cron: cross-linker (unlinked-mention → wikilink), dedup/merge, taxonomy enforcement, orphan +
  stale-note reports into `_meta/INDEX.md`.
- **Outcome:** the graph stays coherent instead of drifting (the real long-term cost of "memory").

---

## 6. Risks, Costs, and Recommendation

### 6.1 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Schema drift / link rot** as the app evolves (new tables, renamed columns) | Med | Export schema versioned next to migrations; UUID slugs + `aliases`; Phase 5 maintenance jobs; stale-note dashboard. |
| R2 | **Stale mirror** — vault lags Supabase between cron runs | Med | Frame vault as *eventually-consistent derived* memory, never source of truth; AI tools annotate `source_updated_at`; tighten cron cadence if needed. |
| R3 | **RLS bypass via the exporter** — service-role export could leak rows a user shouldn't see, then AI reads them | **High** | Exporter must **re-apply visibility** (export per-project, and have AI read tools filter to the caller's membership exactly like `get_visible_progress_items`). Treat the vault as project-scoped; never hand cross-project notes to a tool without re-checking membership. This is the one place to get exactly right. |
| R4 | **Concurrent-writer corruption** (exporter + Obsidian + Git) | Med | Single authoritative writer (exporter); Obsidian/AI read-mostly; surgical `PATCH` only for the rare write-back; never stack two sync services. |
| R5 | **Storage / scale** — high-cardinality rows explode file count | Low | Entities-as-notes only; comments/events/history embedded in parent notes, not separate files. Vault is text (tiny) and lives in Git, **not** the 1GB Supabase Storage budget. |
| R6 | **Mobile breakage** | Low (designed out) | Vault is back-office only; never bundled into Capacitor; no isomorphic-git-on-phone, no localhost REST on phone. |
| R7 | **Maintenance burden** — "AI + Obsidian" ≠ memory without curation | Med | Budget Phase 5 explicitly; provenance/verified fields; merge-not-append loop. |
| R8 | **Apple/compliance** | Low | No new auth flow, no new user-facing role, no change to account-deletion. Vault is developer infra. Confirm-card/audit discipline unchanged. |

### 6.2 Costs

- **Money:** ~HK$0. Git hosting already exists; Obsidian + Local REST API + Dataview + Smart
  Connections + Obsidian Git are free; embeddings are local (`bge-micro-v2`). No new SaaS, no
  Supabase tier change (vault is text in Git, not Storage). Avoid paid Obsidian Sync (use Git).
- **Engineering:** Phase 0 ≈ ½ day; MVP through Phase 2 ≈ 1 week; full (Phases 3–5) ≈ another week
  + ongoing maintenance. All additive — **zero rewrites**, new tables/tools only.
- **Token/runtime:** new read tools *reduce* AI token spend (1 traversal vs N reads + re-reasoning);
  tiered retrieval keeps note reads bounded. Site-facts add a small daily-budget footprint, already
  metered by `ai_usage` / `record_ai_usage`.

### 6.3 Recommendation

**Do Phase 0 now** — it's a half-day, zero-risk upgrade that immediately makes the existing
dev-memory vault a real graph (backlinks, orphans, staleness) and wires Claude Code to it via MCP.

**Then commit to Option A (one-way file+Git export) as the backbone**, build the MVP (projects +
progress + documents) and the three AI read tools (Phases 1–2). This is where the leverage is: AI
站長 stops re-deriving the world every turn and gains the cross-entity reasoning the FK graph already
supports. Treat **R3 (RLS-correct export + per-caller filtering) as the gating correctness
requirement** — get that exactly right before exposing any tool.

**Defer Options B/C/D appropriately:** B (Local REST API) is a developer-desktop convenience only —
never on the AI hot path. C (write-back) waits for site-facts (Phase 3) and must ride the existing
confirm-card + `ai_actions` + `audit_ledger` discipline so Obsidian never writes the database. D
(embeddings) only earns its keep once the vault has density (Phase 3+).

**Hard invariants throughout:** Supabase is the only source of truth; Obsidian is a derived,
read-mostly, project-scoped mirror; the vault is back-office (never shipped in the Capacitor bundle);
every write stays inside RLS + confirm-card + audit-ledger; migrations are new-tables-only and
backwards-compatible. Under these invariants the integration fits the LOCKED stack with **no
rewrites** and turns the app's biggest AI gap — no structured memory — into its differentiator: an
AI 站長 that actually remembers the site.

---

### Appendix — Load-bearing source references

**This codebase**
- AI loop / gating: `supabase/functions/ai-assistant/index.ts`
- Read tools: `supabase/functions/ai-assistant/tools.ts`
- Mutate tools (confirm-card discipline): `supabase/functions/ai-assistant/tools-mutate.ts`
- AI schema (conversations/messages/actions/usage + RLS + budget): `supabase/v56-ai-assistant.sql`
- Documents register: `supabase/v40-split/1-tables.sql`; storage `supabase/v40-split/5-storage-bucket.sql`
- Drawings: `supabase/v8-drawings.sql`
- Frontend AI surface: `src/components/assistant/AssistantPanel.tsx`, `src/pages/ProjectDetail.tsx`
- Dev-memory vault: `C:\Users\user\.claude\projects\C--Users-user-construction-app\memory\*.md`

**Obsidian (external)**
- Local REST API: https://coddingtonbear.github.io/obsidian-local-rest-api/ · https://github.com/coddingtonbear/obsidian-local-rest-api
- AI-memory pattern (Karpathy LLM Wiki): https://github.com/ar9av/obsidian-wiki
- Properties/types: https://help.obsidian.md/properties
- Dataview: https://github.com/blacksmithgu/obsidian-dataview
- Smart Connections (local embeddings): https://github.com/brianpetro/obsidian-smart-connections
- Obsidian Git (sync limits): https://github.com/Vinzent03/obsidian-git
- Advanced URI: https://vinzent03.github.io/obsidian-advanced-uri/
