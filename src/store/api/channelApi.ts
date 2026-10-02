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
  endpoints: (builder) => ({
    getMessages: builder.query<ChannelMessage[], void>({
      queryFn: () => {
        messageCache.prune(Date.now() - SHIFT_MS);
        return { data: messageCache.load() };
      },
      keepUnusedDataFor: Number.MAX_SAFE_INTEGER,
    }),
    retryClip: builder.mutation<null, string>({
      queryFn: (clipId) => {
        registry.controller?.retryClip(clipId);
        return { data: null };
      },
    }),
    deleteQueued: builder.mutation<null, string>({
      queryFn: (clipId) => {
        registry.controller?.deleteQueued(clipId);
        return { data: null };
      },
    }),
    markPlayed: builder.mutation<null, string>({
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
    for (const message of list) {
      const index = draft.findIndex((existing) => existing.id === message.id);
      if (index >= 0) draft[index] = message;
      else draft.push(message);
    }
    draft.sort((first, second) => first.seq - second.seq);
  });
};

export const setHeardBy = (msgId: string, heardBy: number) =>
  channelApi.util.updateQueryData('getMessages', undefined, (draft) => {
    const message = draft.find((existing) => existing.id === msgId);
    if (message) {
      message.heardBy = heardBy;
      messageCache.upsert([{ ...message }]);
    }
  });
