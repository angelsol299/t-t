import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../../server/src/index.ts';
import { Bot } from '../src/bot.ts';
import { toxiproxy } from '../src/toxiproxy.ts';

// Test harness: a real server on a temp dir, behind a real Toxiproxy.
// Each bot gets its own proxy so we can break one person's link at a time.

const SERVER_PORT = 13_000;
const TP_PORT = 18_474;
export const TP = toxiproxy(`http://localhost:${TP_PORT}`);
export const DIRECT = `http://localhost:${SERVER_PORT}`;

let server: ReturnType<typeof createServer> | null = null;
let tpProc: ChildProcess | null = null;
let dataDir = '';
const bots: Bot[] = [];
let nextPort = 14_001;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(cond: () => boolean, ms = 10_000, what = 'condition') {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

export async function start() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teton-test-'));
  server = createServer({ port: SERVER_PORT, dataDir, quiet: true });
  await server.ready;
  if (!(await TP.ping())) {
    let spawnError: Error | null = null;
    tpProc = spawn('toxiproxy-server', ['-port', String(TP_PORT)], { stdio: 'ignore' });
    tpProc.on('error', (err) => (spawnError = err));
    const end = Date.now() + 5000;
    while (!(await TP.ping())) {
      if (spawnError) throw new Error('toxiproxy-server not found: brew install toxiproxy (see README)');
      if (Date.now() > end) throw new Error('toxiproxy-server did not start');
      await sleep(100);
    }
  }
}

export async function stop() {
  for (const bot of bots) bot.close();
  bots.length = 0;
  await server?.close();
  tpProc?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

/** A connected bot with its own Toxiproxy link, returned with that proxy's name. */
export async function bot(name: string): Promise<{ bot: Bot; link: string }> {
  const port = nextPort++;
  const link = `link_${port}`;
  await TP.proxy(link, `127.0.0.1:${port}`, `127.0.0.1:${SERVER_PORT}`);
  const bot = new Bot({ name, server: `http://127.0.0.1:${port}` });
  bots.push(bot);
  await bot.connect();
  return { bot: bot, link };
}

export async function serverMessages() {
  const res = await fetch(`${DIRECT}/messages?since=0`);
  return ((await res.json()) as { messages: { id: string; durationMs: number }[] }).messages;
}

export async function clipState(id: string) {
  const res = await fetch(`${DIRECT}/clips/${id}`);
  return (await res.json()) as { received: number[]; committed: boolean };
}
