// Lightweight tutorial KEY index — safe to import from always-loaded shells
// (AppLayout/HelpButton) without pulling the tutorial dataset into the entry chunk.

export const SCREEN_TUTORIAL: Record<string, string> = {
  "progress": "progress-tracking",
  "issues": "report-issue",
  "si": "site-instruction",
  "vo": "variation-order",
  "ptw": "ptw-permit-to-work",
  "daily": "daily-log",
  "materials": "material-request",
  "timetable": "timetable",
  "contacts": "contacts",
  "drawings": "drawing-version-control",
  "admin": "project-management",
  "dashboard": "dashboard"
}

export const TUTORIAL_KEYS: string[] = ["auth-register-login","apply-join-project","multi-tier-approval","project-management","progress-tracking","planned-progress","progress-report-export","report-issue","escalation-chain","handle-resolve-reopen","site-instruction","variation-order","ptw-permit-to-work","daily-log","material-request","timetable","contacts","drawing-version-control","user-role-management","approval-chain-config","dashboard","push-notifications","offline-readonly-cache","quick-start","account-deletion","approval-chains-overview"]

export function hasTutorial(key: string | undefined | null): boolean {
  return !!key && TUTORIAL_KEYS.includes(key)
}
