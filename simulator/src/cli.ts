import { scenarios } from './scenarios.ts';
import { toxiproxy } from './toxiproxy.ts';

// npm run sim -- setup                 create the proxies (app :4000, bots :4001)
// npm run sim -- <scenario> [--target app|bots|all]
// npm run sim -- status

const UPSTREAM = process.env.UPSTREAM ?? 'localhost:3000';
export const PROXIES = { app: { listen: '0.0.0.0:4000' }, bots: { listen: '0.0.0.0:4001' } } as const;

const args = process.argv.slice(2);
const command = args[0];
const targetArg = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'app';
const proxies = targetArg === 'all' ? Object.keys(PROXIES) : [targetArg];
const toxiproxyClient = toxiproxy();
const log = (text: string) => console.log(`${new Date().toLocaleTimeString('en-GB')}  ${text}`);

function help() {
  console.log('Usage: npm run sim -- <command> [--target app|bots|all]\n');
  console.log('  setup     create proxies app (:4000) and bots (:4001) → ' + UPSTREAM);
  console.log('  status    show proxies and active toxics');
  for (const [name, scenario] of Object.entries(scenarios)) console.log(`  ${name.padEnd(9)} ${scenario.about}`);
}

async function main() {
  if (!command || command === 'help' || command === '--help') return help();
  if (!(await toxiproxyClient.ping())) {
    console.error('Toxiproxy is not running. Start it with `toxiproxy-server` (brew) or `docker compose up -d`.');
    process.exit(1);
  }
  if (command === 'setup') {
    for (const [name, proxy] of Object.entries(PROXIES)) {
      await toxiproxyClient.proxy(name, proxy.listen, UPSTREAM);
      log(`proxy ${name}: ${proxy.listen} → ${UPSTREAM}`);
    }
    return;
  }
  if (command === 'status') {
    for (const [name, proxy] of Object.entries(await toxiproxyClient.list())) {
      const toxics = proxy.toxics.map((toxic) => `${toxic.type}(${toxic.stream})`).join(', ') || 'none';
      console.log(`${name.padEnd(5)} ${proxy.listen} → ${proxy.upstream}  ${proxy.enabled ? 'enabled ' : 'DISABLED'}  toxics: ${toxics}`);
    }
    return;
  }
  const scenario = scenarios[command];
  if (!scenario) {
    help();
    process.exit(1);
  }
  const existing = await toxiproxyClient.list();
  for (const proxy of proxies) {
    if (!existing[proxy]) {
      console.error(`No proxy "${proxy}". Run \`npm run sim -- setup\` first.`);
      process.exit(1);
    }
    await toxiproxyClient.reset(proxy);
  }
  log(`${command} on ${proxies.join(', ')} — ${scenario.about}`);
  const abortController = new AbortController();
  process.on('SIGINT', async () => {
    abortController.abort();
    for (const proxy of proxies) await toxiproxyClient.reset(proxy);
    log('restored a clean link');
    process.exit(0);
  });
  await scenario.run({ toxiproxyClient, proxies, signal: abortController.signal, log });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
