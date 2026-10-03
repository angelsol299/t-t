import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Bot } from './bot.ts';
import { toxiproxy } from './toxiproxy.ts';

// Interactive bot caregivers for manual testing next to a real phone.
//   npm run bots                      (connects through Toxiproxy :4001)
//   SERVER=http://localhost:3000 npm run bots   (bypass Toxiproxy)

const SERVER = process.env.SERVER ?? 'http://localhost:4001';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const NAMES = ['Anna', 'Jonas', 'Maria'];

const time = () => new Date().toLocaleTimeString('en-GB');
const log = (text: string) => {
  process.stdout.write(`\r${time()}  ${text}\n> `);
};

function sample(name: string): Uint8Array | undefined {
  const file = path.join(scriptDir, '..', 'samples', `${name.toLowerCase()}.ul`);
  return fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : undefined;
}

const bots = new Map<string, Bot>();
for (const name of NAMES) {
  const bot = new Bot({ name, server: SERVER, sample: sample(name), log });
  bot.on('floor_taken', (speaker) => {
    if (name === NAMES[0] && !NAMES.includes(speaker.name)) log(`📣 ${speaker.name} is talking`);
  });
  bot.on('message', (message) => {
    if (name === NAMES[0])
      log(`✉  #${message.seq} ${message.senderName} ${(message.durationMs / 1000).toFixed(1)}s (heard by ${message.heardBy})`);
  });
  bots.set(name.toLowerCase(), bot);
}

let auto: NodeJS.Timeout | null = null;
const toxiproxyClient = toxiproxy();

async function race() {
  const anna = bots.get('anna')!;
  // Delay what the phone receives so it cannot see Anna take the floor: if you
  // press at GO, your floor_request reaches the server after hers and you lose
  // a genuine race (screen 08).
  await toxiproxyClient
    .addToxic('app', { name: 'race', type: 'latency', stream: 'downstream', attributes: { latency: 1500 } })
    .catch(() => {
      log('(no Toxiproxy: race still runs, but you need to press within your round-trip time)');
    });
  for (const count of ['3', '2', '1']) {
    log(`race in ${count}…`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  log('GO — press now and keep holding');
  await anna.talk(4000);
  await toxiproxyClient.removeToxic('app', 'race').catch(() => {});
}

const HELP = `
  <name> talk <sec>   e.g. "anna talk 6" — talk live (or record-and-send if the bot's link is bad)
  <name> leave|join   take a bot off / back on the channel
  race                Anna presses on GO; press on your phone at the same moment to see 08
  auto on|off         random chatter every 10–20s
  status              who is connected, outbox sizes
  quit
`;

async function handle(line: string) {
  const [command, arg, value] = line.trim().toLowerCase().split(/\s+/);
  if (!command) return;
  if (command === 'help') return console.log(HELP);
  if (command === 'quit' || command === 'exit') {
    for (const bot of bots.values()) bot.close();
    process.exit(0);
  }
  if (command === 'race') return race();
  if (command === 'status') {
    for (const bot of bots.values()) {
      log(`${bot.name.padEnd(6)} ${bot.up ? 'online ' : 'offline'}  outbox ${bot.pending.size}  seen ${bot.messages.length}`);
    }
    return;
  }
  if (command === 'auto') {
    if (auto) clearInterval(auto);
    auto = null;
    if (arg !== 'off') {
      const tick = () => {
        const list = [...bots.values()].filter((candidate) => candidate.up);
        const bot = list[Math.floor(Math.random() * list.length)];
        if (bot && !bot.floor) void bot.talk(2000 + Math.random() * 5000);
      };
      auto = setInterval(tick, 10_000 + Math.random() * 10_000);
      log('auto chatter on');
    } else log('auto chatter off');
    return;
  }
  const bot = bots.get(command);
  if (!bot) return log(`unknown "${command}" — try help`);
  if (arg === 'talk') return void bot.talk(Math.max(0.5, Number(value) || 3) * 1000);
  if (arg === 'leave') {
    bot.close();
    return log(`${bot.name} left`);
  }
  if (arg === 'join') {
    await bot.connect();
    return log(`${bot.name} joined`);
  }
  log(`unknown command — try help`);
}

async function main() {
  console.log(`Bots connecting to ${SERVER}…`);
  await Promise.all([...bots.values()].map((bot) => bot.connect()));
  console.log(`Connected: ${NAMES.join(', ')}. Type "help".`);
  const readlineInterface = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  readlineInterface.prompt();
  readlineInterface.on('line', async (line) => {
    try {
      await handle(line);
    } catch (error) {
      log(String(error));
    }
    readlineInterface.prompt();
  });
}

void main();
