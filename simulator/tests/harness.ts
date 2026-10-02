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
export const TOXIPROXY = toxiproxy(`http://localhost:${TP_PORT}`);
export const SERVER_DIRECT_URL = `http://localhost:${SERVER_PORT}`;

let server: ReturnType<typeof createServer> | null = null;
let toxiproxyProcess: ChildProcess | null = null;
let dataDirectory = '';
const bots: Bot[] = [];
let nextPort = 14_001;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(condition: () => boolean, ms = 10_000, description = 'condition') {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${description}`);
    await sleep(25);
  }
}

export async function start() {
  dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teton-test-'));
  server = createServer({ port: SERVER_PORT, dataDirectory, quiet: true });
  await server.ready;
  if (!(await TOXIPROXY.ping())) {
    let spawnError: Error | null = null;
    toxiproxyProcess = spawn('toxiproxy-server', ['-port', String(TP_PORT)], { stdio: 'ignore' });
    toxiproxyProcess.on('error', (error) => (spawnError = error));
    const end = Date.now() + 5000;
    while (!(await TOXIPROXY.ping())) {
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
  toxiproxyProcess?.kill();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}

/** A connected bot with its own Toxiproxy link, returned with that proxy's name. */
export async function bot(name: string): Promise<{ bot: Bot; link: string }> {
  const port = nextPort++;
  const link = `link_${port}`;
  await TOXIPROXY.proxy(link, `127.0.0.1:${port}`, `127.0.0.1:${SERVER_PORT}`);
  const bot = new Bot({ name, server: `http://127.0.0.1:${port}` });
  bots.push(bot);
  await bot.connect();
  return { bot: bot, link };
}

export async function serverMessages() {
  const response = await fetch(`${SERVER_DIRECT_URL}/messages?since=0`);
  return ((await response.json()) as { messages: { id: string; durationMs: number }[] }).messages;
}

export async function clipState(id: string) {
  const response = await fetch(`${SERVER_DIRECT_URL}/clips/${id}`);
  return (await response.json()) as { received: number[]; committed: boolean };
}
