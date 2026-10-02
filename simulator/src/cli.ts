import { scenarios } from './scenarios.ts';
import { toxiproxy } from './toxiproxy.ts';

// npm run sim -- setup                 create the proxies (app :4000, bots :4001)
// npm run sim -- <scenario> [--target app|bots|all]
// npm run sim -- status

const UPSTREAM = process.env.UPSTREAM ?? 'localhost:3000';
export const PROXIES = { app: { listen: '0.0.0.0:4000' }, bots: { listen: '0.0.0.0:4001' } } as const;

const args = process.argv.slice(2);
const cmd = args[0];
const targetArg = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'app';
const proxies = targetArg === 'all' ? Object.keys(PROXIES) : [targetArg];
const tp = toxiproxy();
const log = (m: string) => console.log(`${new Date().toLocaleTimeString('en-GB')}  ${m}`);

function help() {
  console.log('Usage: npm run sim -- <command> [--target app|bots|all]\n');
  console.log('  setup     create proxies app (:4000) and bots (:4001) → ' + UPSTREAM);
  console.log('  status    show proxies and active toxics');
  for (const [name, s] of Object.entries(scenarios)) console.log(`  ${name.padEnd(9)} ${s.about}`);
}

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help') return help();
  if (!(await tp.ping())) {
    console.error('Toxiproxy is not running. Start it with `toxiproxy-server` (brew) or `docker compose up -d`.');
    process.exit(1);
  }
  if (cmd === 'setup') {
    for (const [name, p] of Object.entries(PROXIES)) {
      await tp.proxy(name, p.listen, UPSTREAM);
      log(`proxy ${name}: ${p.listen} → ${UPSTREAM}`);
    }
    return;
  }
  if (cmd === 'status') {
    for (const [name, p] of Object.entries(await tp.list())) {
      const toxics = p.toxics.map((t) => `${t.type}(${t.stream})`).join(', ') || 'none';
      console.log(`${name.padEnd(5)} ${p.listen} → ${p.upstream}  ${p.enabled ? 'enabled ' : 'DISABLED'}  toxics: ${toxics}`);
    }
    return;
  }
  const scenario = scenarios[cmd];
  if (!scenario) {
    help();
    process.exit(1);
  }
  const existing = await tp.list();
  for (const p of proxies) {
    if (!existing[p]) {
      console.error(`No proxy "${p}". Run \`npm run sim -- setup\` first.`);
      process.exit(1);
    }
    await tp.reset(p);
  }
  log(`${cmd} on ${proxies.join(', ')} — ${scenario.about}`);
  const ctl = new AbortController();
  process.on('SIGINT', async () => {
    ctl.abort();
    for (const p of proxies) await tp.reset(p);
    log('restored a clean link');
    process.exit(0);
  });
  await scenario.run({ tp, proxies, signal: ctl.signal, log });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
