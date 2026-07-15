// Centralised re-exports for the materials feature so the orchestrator
// (and downstream code) can import Material types/labels from a single path
// without reaching into the context module.
export type {
  Material,
  MaterialStatus,
  CreateMaterialInput,
  UpdateMaterialPatch,
} from './contexts/MaterialsContext'

export {
  MATERIAL_STATUS_ZH,
  MATERIAL_STATUS_BADGE_CLASS,
  isMaterialLate,
} from './contexts/MaterialsContext'
