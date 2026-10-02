import type { Toxiproxy } from './toxiproxy.ts';

// Network presets. Each one starts from a clean link. Long-running scenarios
// (patchy, flapping) keep going until the signal aborts.

export interface ScenarioContext {
  toxiproxyClient: Toxiproxy;
  proxies: string[];
  signal: AbortSignal;
  log: (message: string) => void;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

async function each(context: ScenarioContext, fn: (proxy: string) => Promise<void>) {
  await Promise.all(context.proxies.map(fn));
}

async function cutConnection(context: ScenarioContext, ms: number) {
  context.log(`✂  link down for ${(ms / 1000).toFixed(1)}s`);
  await each(context, (proxy) => context.toxiproxyClient.enable(proxy, false));
  await sleep(ms, context.signal);
  await each(context, (proxy) => context.toxiproxyClient.enable(proxy, true));
  context.log('✓  link up');
}

export const scenarios: Record<string, { about: string; run(context: ScenarioContext): Promise<void> }> = {
  good: {
    about: 'Clean link: no toxics, proxies enabled.',
    async run() {},
  },
  weak: {
    about: '600±400ms latency each way and ~6KB/s upstream (below the 8KB/s live stream): forces record-and-send.',
    async run(context) {
      await each(context, async (proxy) => {
        await context.toxiproxyClient.addToxic(proxy, { name: 'lat_down', type: 'latency', stream: 'downstream', attributes: { latency: 600, jitter: 400 } });
        await context.toxiproxyClient.addToxic(proxy, { name: 'lat_up', type: 'latency', stream: 'upstream', attributes: { latency: 600, jitter: 400 } });
        await context.toxiproxyClient.addToxic(proxy, { name: 'bw_up', type: 'bandwidth', stream: 'upstream', attributes: { rate: 6 } });
      });
    },
  },
  patchy: {
    about: 'A 2s cut every 10s. Cuts under 3s must be absorbed: the status band never flickers.',
    async run(context) {
      while (!context.signal.aborted) {
        await sleep(8000, context.signal);
        if (context.signal.aborted) break;
        await cutConnection(context, 2000);
      }
    },
  },
  dropout: {
    about: 'One 8s cut, then a clean link: offline, then "Back online".',
    async run(context) {
      await cutConnection(context, 8000);
    },
  },
  offline: {
    about: 'Link down until you run `sim good` (or press Ctrl-C).',
    async run(context) {
      await each(context, (proxy) => context.toxiproxyClient.enable(proxy, false));
      context.log('✂  link down — run `npm run sim -- good` to restore');
    },
  },
  flapping: {
    about: 'Random 1–6s cuts with 3–10s of signal in between.',
    async run(context) {
      while (!context.signal.aborted) {
        await sleep(3000 + Math.random() * 7000, context.signal);
        if (context.signal.aborted) break;
        await cutConnection(context, 1000 + Math.random() * 5000);
      }
    },
  },
  zombie: {
    about: 'Connections stay open but no data flows (captive wifi). Heartbeats must notice.',
    async run(context) {
      await each(context, async (proxy) => {
        await context.toxiproxyClient.addToxic(proxy, { name: 'zombie_down', type: 'timeout', stream: 'downstream', attributes: { timeout: 0 } });
        await context.toxiproxyClient.addToxic(proxy, { name: 'zombie_up', type: 'timeout', stream: 'upstream', attributes: { timeout: 0 } });
      });
    },
  },
  reset: {
    about: 'Every connection is reset 1.5s after it opens: uploads must resume, not restart.',
    async run(context) {
      await each(context, (proxy) =>
        context.toxiproxyClient.addToxic(proxy, { name: 'reset', type: 'reset_peer', stream: 'upstream', attributes: { timeout: 1500 } }),
      );
    },
  },
};
