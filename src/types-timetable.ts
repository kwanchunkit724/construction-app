// Re-export Timetable / Events types so the orchestrator can centralise them
// without each consumer reaching into context files directly. The contexts
// remain the source of truth (inline types per CLAUDE.md "Where new features
// fit" guidance — no edits to src/types.ts in this milestone).

export type { Event, EventType } from './contexts/EventsContext'
export { EVENT_TYPE_ZH } from './contexts/EventsContext'
export type { TimetableEntry, TimetableSource } from './contexts/TimetableContext'
