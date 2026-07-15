// Re-exports for the central src/types.ts forwarder (wired by orchestrator).
// Keep this file thin — definitions live in DailiesContext.tsx so the
// context module remains the single source of truth.
export { WEATHER_OPTIONS } from './contexts/DailiesContext'
export type { Daily, Weather, DailyPayload } from './contexts/DailiesContext'
