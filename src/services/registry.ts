import type { Controller } from './controller';

// Holds the single controller instance. It is created in an effect once the
// user has a name, so screens and hooks look it up here at call time.
export const registry: { controller: Controller | null } = { controller: null };
