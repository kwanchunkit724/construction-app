// Re-export Contact shape + trade suggestions so feature consumers
// can keep the `from '../types'` import idiom established by the
// rest of the codebase.
export type { Contact, ContactInput } from './contexts/ContactsContext'
export { TRADE_SUGGESTIONS } from './contexts/ContactsContext'
