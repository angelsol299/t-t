import { registry } from '@/services/registry';
import type { Controller } from '@/services/controller';

// The controller is created in an effect, so it may not exist on a screen's
// first render. This stable proxy resolves it at call time instead.
const proxy = new Proxy({} as Controller, {
  get:
    (_, key: string) =>
    (...args: unknown[]) =>
      (registry.controller as unknown as Record<string, (...a: unknown[]) => unknown> | null)?.[key]?.(...args),
});

export function useController(): Controller {
  return proxy;
}
