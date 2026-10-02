import type { Controller } from './controller';

// Breaks the import cycle between the RTK Query mutations and the controller,
// which itself dispatches into the store.
export const registry: { controller: Controller | null } = { controller: null };
