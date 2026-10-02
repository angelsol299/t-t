// Thin client for the Toxiproxy HTTP API (https://github.com/Shopify/toxiproxy).

export type ToxicType = 'latency' | 'bandwidth' | 'slow_close' | 'timeout' | 'reset_peer' | 'slicer' | 'limit_data';

export interface Toxic {
  name: string;
  type: ToxicType;
  stream?: 'upstream' | 'downstream';
  toxicity?: number;
  attributes: Record<string, number>;
}

export function toxiproxy(api = process.env.TOXIPROXY_API ?? 'http://localhost:8474') {
  async function call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 404 && res.status !== 409) {
      throw new Error(`toxiproxy ${method} ${path}: ${res.status} ${await res.text()}`);
    }
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  return {
    async ping(): Promise<boolean> {
      try {
        await call('GET', '/version');
        return true;
      } catch {
        return false;
      }
    },
    /** Create (or recreate) a proxy listening on `listen` and forwarding to `upstream`. */
    async proxy(name: string, listen: string, upstream: string) {
      await call('DELETE', `/proxies/${name}`);
      await call('POST', '/proxies', { name, listen, upstream, enabled: true });
    },
    async enable(name: string, enabled: boolean) {
      await call('POST', `/proxies/${name}`, { enabled });
    },
    async addToxic(proxy: string, toxic: Toxic) {
      await call('POST', `/proxies/${proxy}/toxics`, { stream: 'downstream', toxicity: 1, ...toxic });
    },
    async removeToxic(proxy: string, name: string) {
      await call('DELETE', `/proxies/${proxy}/toxics/${name}`);
    },
    /** Back to a clean link: enabled, no toxics. */
    async reset(proxy: string) {
      const toxics = ((await call('GET', `/proxies/${proxy}/toxics`)) ?? []) as { name: string }[];
      for (const toxic of toxics) await call('DELETE', `/proxies/${proxy}/toxics/${toxic.name}`);
      await call('POST', `/proxies/${proxy}`, { enabled: true });
    },
    async list() {
      return (await call('GET', '/proxies')) as Record<string, { listen: string; upstream: string; enabled: boolean; toxics: Toxic[] }>;
    },
  };
}

export type Toxiproxy = ReturnType<typeof toxiproxy>;
