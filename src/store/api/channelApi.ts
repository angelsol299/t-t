import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { messageCache } from '@/services/db';
import { registry } from '@/services/registry';
import type { ChannelMessage } from '@shared/protocol';

const SHIFT_MS = 12 * 60 * 60 * 1000;

// The message list. The cache entry starts from SQLite (so the list is there
// instantly, even offline) and is then kept current by socket events, which
// the controller writes in with `upsertMessages` / `setHeardBy`.
export const channelApi = createApi({
  reducerPath: 'channelApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (b) => ({
    getMessages: b.query<ChannelMessage[], void>({
      queryFn: () => {
        messageCache.prune(Date.now() - SHIFT_MS);
        return { data: messageCache.load() };
      },
      keepUnusedDataFor: Number.MAX_SAFE_INTEGER,
    }),
    retryClip: b.mutation<null, string>({
      queryFn: (clipId) => {
        registry.controller?.retryClip(clipId);
        return { data: null };
      },
    }),
    deleteQueued: b.mutation<null, string>({
      queryFn: (clipId) => {
        registry.controller?.deleteQueued(clipId);
        return { data: null };
      },
    }),
    markPlayed: b.mutation<null, string>({
      queryFn: (msgId) => {
        registry.controller?.markPlayed(msgId);
        return { data: null };
      },
    }),
  }),
});

export const { useGetMessagesQuery, useRetryClipMutation, useDeleteQueuedMutation } = channelApi;

export const upsertMessages = (list: ChannelMessage[]) => {
  messageCache.upsert(list);
  return channelApi.util.updateQueryData('getMessages', undefined, (draft) => {
    for (const m of list) {
      const i = draft.findIndex((x) => x.id === m.id);
      if (i >= 0) draft[i] = m;
      else draft.push(m);
    }
    draft.sort((a, b) => a.seq - b.seq);
  });
};

export const setHeardBy = (msgId: string, heardBy: number) =>
  channelApi.util.updateQueryData('getMessages', undefined, (draft) => {
    const m = draft.find((x) => x.id === msgId);
    if (m) {
      m.heardBy = heardBy;
      messageCache.upsert([{ ...m }]);
    }
  });
