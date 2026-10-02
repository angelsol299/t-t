import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isLate, type ServerMsg } from '../../shared/protocol.ts';
import { DIRECT, TP, bot, clipState, serverMessages, sleep, start, stop, until } from './harness.ts';

beforeAll(start);
afterAll(stop);

const count = <T>(list: T[], pred: (x: T) => boolean) => list.filter(pred).length;

describe('never quietly lose what someone said', () => {
  it('a clip recorded with no signal is delivered exactly once after recovery', async () => {
    const { bot: anna, link } = await bot('Anna');
    const { bot: jonas } = await bot('Jonas');

    await TP.enable(link, false);
    await until(() => !anna.up, 5000, 'Anna offline');
    const { clipId, live } = await anna.talk(1500, { realtime: false });
    expect(live).toBe(false);
    await sleep(1000);
    expect(jonas.messages.some((m) => m.id === clipId)).toBe(false); // nothing partial leaked

    await TP.enable(link, true);
    const got = await jonas.waitFor((m) => m.id === clipId);
    expect(got.durationMs).toBe(1500);

    await sleep(1500); // give any duplicate a chance to show up
    expect(count(jonas.messages, (m) => m.id === clipId)).toBe(1);
    expect(count(await serverMessages(), (m) => m.id === clipId)).toBe(1);
    expect(anna.pending.size).toBe(0);
  });

  it('an interrupted upload resumes from what the server already has', async () => {
    const { bot: anna, link } = await bot('Anna');
    await TP.enable(link, false);
    await until(() => !anna.up, 5000, 'Anna offline');
    const { clipId } = await anna.talk(3000, { realtime: false }); // 12 chunks
    const clip = anna.pending.get(clipId)!;

    // The first 5 chunks made it before the connection died.
    for (let seq = 0; seq < 5; seq++) {
      await fetch(`${DIRECT}/clips/${clipId}/chunks/${seq}`, { method: 'PUT', body: new Uint8Array(clip.chunks[seq]) });
    }
    await TP.enable(link, true);
    await until(() => anna.pending.size === 0, 10_000, 'upload to finish');
    expect(anna.puts).toBe(7); // only the missing ones
    expect((await clipState(clipId)).committed).toBe(true);
  });

  it('survives connections being reset mid-upload and still delivers once', async () => {
    const { bot: anna, link } = await bot('Anna');
    const { bot: jonas } = await bot('Jonas');
    await TP.enable(link, false);
    await until(() => !anna.up, 5000, 'Anna offline');
    const { clipId } = await anna.talk(4000, { realtime: false });

    // Every connection is reset shortly after it opens.
    await TP.addToxic(link, { name: 'reset', type: 'reset_peer', stream: 'upstream', attributes: { timeout: 50 } });
    await TP.enable(link, true);
    await sleep(2500);
    await TP.removeToxic(link, 'reset');

    await jonas.waitFor((m) => m.id === clipId, 20_000);
    await sleep(1000);
    expect(count(jonas.messages, (m) => m.id === clipId)).toBe(1);
    expect(count(await serverMessages(), (m) => m.id === clipId)).toBe(1);
  });

  it('a speaker cut mid-stream frees the floor within the lease, and the full clip arrives later', async () => {
    const { bot: anna, link } = await bot('Anna');
    const { bot: jonas } = await bot('Jonas');
    const freed: Extract<ServerMsg, { t: 'floor_free' }>[] = [];
    jonas.on('floor_free', (m) => freed.push(m));

    const talking = anna.talk(3000); // live, real time
    await until(() => jonas.floor?.name === 'Anna', 3000, 'Anna on air');
    const clipId = jonas.floor!.clipId;
    await sleep(1000);

    // Zombie link: the socket stays open but nothing gets through.
    const cutAt = Date.now();
    await TP.addToxic(link, { name: 'zombie', type: 'timeout', stream: 'upstream', attributes: { timeout: 0 } });
    await until(() => freed.length > 0, 6000, 'floor to free');
    expect(Date.now() - cutAt).toBeLessThan(4500);
    expect(freed[0].reason).toBe('lease_expired');
    expect(jonas.heard.get(clipId)!.size).toBeLessThan(12); // Jonas heard only part of it live…
    expect(jonas.messages.some((m) => m.id === clipId)).toBe(false); // …and no partial message exists

    await talking;
    await TP.removeToxic(link, 'zombie');
    const full = await jonas.waitFor((m) => m.id === clipId, 20_000);
    expect(full.durationMs).toBe(3000); // the whole recording, not the streamed part
    expect(count(jonas.messages, (m) => m.id === clipId)).toBe(1);
  });

  it('reconnecting with lastSeq returns exactly the missed messages', async () => {
    const { bot: anna } = await bot('Anna');
    const { bot: maria } = await bot('Maria');
    maria.close();
    const a = await anna.talk(600, { realtime: false });
    const b = await anna.talk(600, { realtime: false });
    await until(() => anna.pending.size === 0, 10_000, 'Anna clips committed');

    const welcome = new Promise<Extract<ServerMsg, { t: 'welcome' }>>((r) => maria.once('welcome', r));
    await maria.connect();
    const missed = (await welcome).missed.map((m) => m.id);
    expect(missed).toEqual([a.clipId, b.clipId]);
  });
});

describe('floor control', () => {
  it('two people pressing at once: one wins, the loser records nothing', async () => {
    const { bot: anna } = await bot('Anna');
    const { bot: jonas } = await bot('Jonas');
    const [ra, rj] = await Promise.all([anna.talk(800), jonas.talk(800)]);

    expect([ra.granted, rj.granted].filter(Boolean)).toHaveLength(1);
    const loser = ra.granted ? rj : ra;
    const winner = ra.granted ? ra : rj;
    await until(() => anna.pending.size === 0 && jonas.pending.size === 0, 10_000, 'outboxes to drain');
    const ids = (await serverMessages()).map((m) => m.id);
    expect(ids).toContain(winner.clipId);
    expect(ids).not.toContain(loser.clipId);
    expect((await clipState(loser.clipId)).received).toEqual([]);
  });
});

describe('server idempotency and lateness', () => {
  const headers = { 'x-client-id': 'test-client', 'x-client-name': 'Tester' };

  async function upload(id: string, recordedAt: number) {
    const chunk = new Uint8Array(2000).fill(0xff);
    await fetch(`${DIRECT}/clips/${id}/chunks/0`, { method: 'PUT', body: chunk, headers });
    await fetch(`${DIRECT}/clips/${id}/chunks/0`, { method: 'PUT', body: chunk, headers }); // duplicate
    const body = JSON.stringify({ total: 1, durationMs: 250, recordedAt });
    const r1 = await fetch(`${DIRECT}/clips/${id}/complete`, { method: 'POST', body, headers });
    const r2 = await fetch(`${DIRECT}/clips/${id}/complete`, { method: 'POST', body, headers }); // duplicate
    return [(await r1.json()).message, (await r2.json()).message];
  }

  it('duplicate chunks and duplicate completes commit once', async () => {
    const id = randomUUID();
    const [m1, m2] = await upload(id, Date.now());
    expect(m1.seq).toBe(m2.seq);
    expect(count(await serverMessages(), (m) => m.id === id)).toBe(1);
  });

  it('a clip committed more than 30s after it was said is flagged late', async () => {
    const [late] = await upload(randomUUID(), Date.now() - 60_000);
    const [fresh] = await upload(randomUUID(), Date.now() - 5_000);
    expect(isLate(late)).toBe(true);
    expect(isLate(fresh)).toBe(false);
  });

  it('a complete with chunks missing is refused with the list to resend', async () => {
    const id = randomUUID();
    await fetch(`${DIRECT}/clips/${id}/chunks/1`, { method: 'PUT', body: new Uint8Array(10), headers });
    const res = await fetch(`${DIRECT}/clips/${id}/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ total: 3, durationMs: 750, recordedAt: Date.now() }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).missing).toEqual([0, 2]);
  });
});
