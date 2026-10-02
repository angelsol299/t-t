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
const log = (text: string) => console.log(`${new Date().toLocaleTimeString('en-GB')}  ${text}`);

function help() {
  console.log('Usage: npm run sim -- <command> [--target app|bots|all]\n');
  console.log('  setup     create proxies app (:4000) and bots (:4001) → ' + UPSTREAM);
  console.log('  status    show proxies and active toxics');
  for (const [name, scenario] of Object.entries(scenarios)) console.log(`  ${name.padEnd(9)} ${scenario.about}`);
}

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help') return help();
  if (!(await tp.ping())) {
    console.error('Toxiproxy is not running. Start it with `toxiproxy-server` (brew) or `docker compose up -d`.');
    process.exit(1);
  }
  if (cmd === 'setup') {
    for (const [name, proxy] of Object.entries(PROXIES)) {
      await tp.proxy(name, proxy.listen, UPSTREAM);
      log(`proxy ${name}: ${proxy.listen} → ${UPSTREAM}`);
    }
    return;
  }
  if (cmd === 'status') {
    for (const [name, proxy] of Object.entries(await tp.list())) {
      const toxics = proxy.toxics.map((toxic) => `${toxic.type}(${toxic.stream})`).join(', ') || 'none';
      console.log(`${name.padEnd(5)} ${proxy.listen} → ${proxy.upstream}  ${proxy.enabled ? 'enabled ' : 'DISABLED'}  toxics: ${toxics}`);
    }
    return;
  }
  const scenario = scenarios[cmd];
  if (!scenario) {
    help();
    process.exit(1);
  }
  const existing = await tp.list();
  for (const proxy of proxies) {
    if (!existing[proxy]) {
      console.error(`No proxy "${proxy}". Run \`npm run sim -- setup\` first.`);
      process.exit(1);
    }
    await tp.reset(proxy);
  }
  log(`${cmd} on ${proxies.join(', ')} — ${scenario.about}`);
  const ctl = new AbortController();
  process.on('SIGINT', async () => {
    ctl.abort();
    for (const proxy of proxies) await tp.reset(proxy);
    log('restored a clean link');
    process.exit(0);
  });
  await scenario.run({ tp, proxies, signal: ctl.signal, log });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
