// =============================================================
// progressTemplates.ts — Problem 4 / P1 template registry
// =============================================================
// One project-level field (projects.project_type) selects a template.
// A template is pure CONFIGURATION that drives the progress table's
// per-type UI: which tracking modes the create modal offers, what to
// call a "zone" and a "label", whether to auto-create a single zone,
// and which headline stat tiles to show.
//
// This module is the SINGLE SOURCE for that switching — components read
// from `templateFor(project.project_type)` instead of hardcoding strings
// or mode lists. 'general' encodes today's exact behaviour so existing
// projects are byte-identical.
//
// Scope note (P1): only the 'checklist' mode is actually new. The
// 'quantity' (渠務) and 'unit_status' (大樓維修) modes arrive in P2 / P3,
// so drainage / maintenance are made SELECTABLE here with sensible
// checklist/percentage defaults — no template references a mode that the
// app can't yet render.

import type { ProjectType, TrackingMode } from '../types'

// A KPI tile descriptor for the project-detail stat strip. P1 keeps the
// 'general' tiles literally identical to today (status-count tiles in
// ProjectDetail.tsx), so the registry only needs to name them; the actual
// counting stays in the page. `kind: 'status-counts'` = today's four
// 已完成/進行中/落後/未開始 tiles. Other kinds are placeholders the page can
// special-case as P2/P3 KPIs (距交場 / Σm / 距法定限期) land.
export type KpiTilesKind = 'status-counts' | 'small-works' | 'drainage' | 'maintenance'

export interface ProgressTemplate {
  type: ProjectType
  // Allowed tracking modes for items created under this project type, in
  // the order they should appear in the create-item mode picker.
  allowedModes: TrackingMode[]
  // Pre-selected mode in the create-item modal.
  defaultMode: TrackingMode
  // What a "zone" is called for this type. null ⇒ the zone concept is
  // hidden from the UI (single implicit zone, e.g. small works).
  zoneNoun: string | null
  // What a tracked "label" is called (樓層 / 工序 / 室). Drives badges and
  // the create-item label editor copy.
  labelNoun: string
  // When true the project is created with one implicit zone {id:'A',
  // name:'工地'} and the zone chrome (+ the "尚未設定分區" dead-end) is
  // hidden. Used by small_works.
  autoZone: boolean
  // Which headline stat tiles the project-detail page renders.
  kpiTiles: KpiTilesKind
}

// 'general' = today's behaviour, verbatim. Do not change without a
// backwards-compat review: existing projects all resolve to this.
const GENERAL: ProgressTemplate = {
  type: 'general',
  allowedModes: ['percentage', 'floors', 'checklist'],
  defaultMode: 'percentage',
  zoneNoun: '分區/座',
  labelNoun: '樓層',
  autoZone: false,
  kpiTiles: 'status-counts',
}

const SMALL_WORKS: ProgressTemplate = {
  type: 'small_works',
  allowedModes: ['checklist', 'percentage'],
  defaultMode: 'checklist',
  zoneNoun: null, // single implicit zone — hide the zone chrome
  labelNoun: '工序',
  autoZone: true,
  kpiTiles: 'small-works',
}

// drainage / maintenance: selectable in P1, but quantity / unit_status
// are P2 / P3. Give them checklist/percentage defaults so they never
// reference an unbuilt mode. zoneNoun follows the spec table (§3.1).
const DRAINAGE: ProgressTemplate = {
  type: 'drainage',
  allowedModes: ['checklist', 'percentage'],
  defaultMode: 'checklist',
  zoneNoun: '路段',
  labelNoun: '工序',
  autoZone: false,
  kpiTiles: 'drainage',
}

const MAINTENANCE: ProgressTemplate = {
  type: 'maintenance',
  allowedModes: ['checklist', 'percentage'],
  defaultMode: 'checklist',
  zoneNoun: '座',
  labelNoun: '室/位置',
  autoZone: false,
  kpiTiles: 'maintenance',
}

const REGISTRY: Record<ProjectType, ProgressTemplate> = {
  general: GENERAL,
  small_works: SMALL_WORKS,
  drainage: DRAINAGE,
  maintenance: MAINTENANCE,
}

// Resolve a template for a project_type. Defensive: an unknown / missing
// value (e.g. a future type from a newer client, or a row read before the
// column existed) degrades to 'general' = today's behaviour.
export function templateFor(projectType: ProjectType | null | undefined): ProgressTemplate {
  if (projectType && projectType in REGISTRY) return REGISTRY[projectType]
  return GENERAL
}
