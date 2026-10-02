import type { Toxiproxy } from './toxiproxy.ts';

// Network presets. Each one starts from a clean link. Long-running scenarios
// (patchy, flapping) keep going until the signal aborts.

export interface ScenarioCtx {
  tp: Toxiproxy;
  proxies: string[];
  signal: AbortSignal;
  log: (msg: string) => void;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

async function each(ctx: ScenarioCtx, fn: (proxy: string) => Promise<void>) {
  await Promise.all(ctx.proxies.map(fn));
}

async function cut(ctx: ScenarioCtx, ms: number) {
  ctx.log(`✂  link down for ${(ms / 1000).toFixed(1)}s`);
  await each(ctx, (proxy) => ctx.tp.enable(proxy, false));
  await sleep(ms, ctx.signal);
  await each(ctx, (proxy) => ctx.tp.enable(proxy, true));
  ctx.log('✓  link up');
}

export const scenarios: Record<string, { about: string; run(ctx: ScenarioCtx): Promise<void> }> = {
  good: {
    about: 'Clean link: no toxics, proxies enabled.',
    async run() {},
  },
  weak: {
    about: '600±400ms latency each way and ~6KB/s upstream (below the 8KB/s live stream): forces record-and-send.',
    async run(ctx) {
      await each(ctx, async (proxy) => {
        await ctx.tp.addToxic(proxy, { name: 'lat_down', type: 'latency', stream: 'downstream', attributes: { latency: 600, jitter: 400 } });
        await ctx.tp.addToxic(proxy, { name: 'lat_up', type: 'latency', stream: 'upstream', attributes: { latency: 600, jitter: 400 } });
        await ctx.tp.addToxic(proxy, { name: 'bw_up', type: 'bandwidth', stream: 'upstream', attributes: { rate: 6 } });
      });
    },
  },
  patchy: {
    about: 'A 2s cut every 10s. Cuts under 3s must be absorbed: the status band never flickers.',
    async run(ctx) {
      while (!ctx.signal.aborted) {
        await sleep(8000, ctx.signal);
        if (ctx.signal.aborted) break;
        await cut(ctx, 2000);
      }
    },
  },
  dropout: {
    about: 'One 8s cut, then a clean link: offline, then "Back online".',
    async run(ctx) {
      await cut(ctx, 8000);
    },
  },
  offline: {
    about: 'Link down until you run `sim good` (or press Ctrl-C).',
    async run(ctx) {
      await each(ctx, (proxy) => ctx.tp.enable(proxy, false));
      ctx.log('✂  link down — run `npm run sim -- good` to restore');
    },
  },
  flapping: {
    about: 'Random 1–6s cuts with 3–10s of signal in between.',
    async run(ctx) {
      while (!ctx.signal.aborted) {
        await sleep(3000 + Math.random() * 7000, ctx.signal);
        if (ctx.signal.aborted) break;
        await cut(ctx, 1000 + Math.random() * 5000);
      }
    },
  },
  zombie: {
    about: 'Connections stay open but no data flows (captive wifi). Heartbeats must notice.',
    async run(ctx) {
      await each(ctx, async (proxy) => {
        await ctx.tp.addToxic(proxy, { name: 'zombie_down', type: 'timeout', stream: 'downstream', attributes: { timeout: 0 } });
        await ctx.tp.addToxic(proxy, { name: 'zombie_up', type: 'timeout', stream: 'upstream', attributes: { timeout: 0 } });
      });
    },
  },
  reset: {
    about: 'Every connection is reset 1.5s after it opens: uploads must resume, not restart.',
    async run(ctx) {
      await each(ctx, (proxy) =>
        ctx.tp.addToxic(proxy, { name: 'reset', type: 'reset_peer', stream: 'upstream', attributes: { timeout: 1500 } }),
      );
    },
  },
};
