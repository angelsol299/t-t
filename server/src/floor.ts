import { FLOOR_LEASE_MS, type FloorFreeReason, type Speaker } from '../../shared/protocol.ts';

// Who may talk. One person holds the floor at a time, and the first request to
// reach the server wins. The holder keeps the floor by sending audio: if none
// arrives for FLOOR_LEASE_MS milliseconds (dropped link, crashed app), the lease
// expires and the floor frees itself, so the channel can never get stuck.

const LEASE_CHECK_INTERVAL_MILLISECONDS = 250;

export interface FloorRequestResult {
  granted: boolean;
  holder: Speaker; // whoever holds the floor now: the requester if granted
}

export function createFloor(onFree: (previousHolder: Speaker, reason: FloorFreeReason) => void) {
  let holder: Speaker | null = null;
  let lastAudioAt = 0;

  function free(reason: FloorFreeReason) {
    if (!holder) return;
    const previousHolder = holder;
    holder = null;
    onFree(previousHolder, reason);
  }

  const leaseTimer = setInterval(() => {
    if (holder && Date.now() - lastAudioAt > FLOOR_LEASE_MS) free('lease_expired');
  }, LEASE_CHECK_INTERVAL_MILLISECONDS);

  return {
    current(): Speaker | null {
      return holder && { ...holder };
    },
    /** Grants the floor unless someone else holds it. Either way, returns who holds it now. */
    request(person: { clientId: string; name: string }, clipId: string): FloorRequestResult {
      if (holder && holder.clientId !== person.clientId) return { granted: false, holder: { ...holder } };
      holder = { clientId: person.clientId, name: person.name, clipId, startedAt: Date.now() };
      lastAudioAt = Date.now();
      return { granted: true, holder: { ...holder } };
    },
    release(clipId: string) {
      if (holder?.clipId === clipId) free('released');
    },
    /** Audio arrived. Returns true, and renews the lease, if it is the holder's current clip. */
    renewLease(clientId: string, clipId: string): boolean {
      if (!holder || holder.clientId !== clientId || holder.clipId !== clipId) return false;
      lastAudioAt = Date.now();
      return true;
    },
    /** The holder's connection went away. */
    freeIfHeldBy(clientId: string) {
      if (holder?.clientId === clientId) free('disconnected');
    },
    stop() {
      clearInterval(leaseTimer);
    },
  };
}

export type Floor = ReturnType<typeof createFloor>;
