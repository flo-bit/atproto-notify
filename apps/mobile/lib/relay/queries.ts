import type {
  ToolsAtmoNotifsDenyPending,
  ToolsAtmoNotifsGetSettings,
  ToolsAtmoNotifsGrant,
  ToolsAtmoNotifsListChannels,
  ToolsAtmoNotifsListGrants,
  ToolsAtmoNotifsListNotifications,
  ToolsAtmoNotifsListPending,
  ToolsAtmoNotifsMuteGrant,
  ToolsAtmoNotifsRevoke,
} from '@atmo/notifs-lexicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '../auth/session';
import { LEXICON_PREFIX } from '../config';
import { callRelay } from './client';

const nsid = (method: string): string => `${LEXICON_PREFIX}.${method}`;

export const queryKeys = {
  pending: ['pending'] as const,
  grants: ['grants'] as const,
  channels: ['channels'] as const,
  settings: ['settings'] as const,
  notifications: (senderDid?: string) =>
    senderDid ? (['notifications', senderDid] as const) : (['notifications'] as const),
};

// --- queries ---------------------------------------------------------------

export function useListPending() {
  const { session } = useSession();
  return useQuery({
    queryKey: queryKeys.pending,
    enabled: session !== null,
    queryFn: () =>
      callRelay<ToolsAtmoNotifsListPending.$output>(session!, nsid('listPending'), null, 'GET'),
  });
}

export function useListGrants() {
  const { session } = useSession();
  return useQuery({
    queryKey: queryKeys.grants,
    enabled: session !== null,
    queryFn: () =>
      callRelay<ToolsAtmoNotifsListGrants.$output>(session!, nsid('listGrants'), null, 'GET'),
  });
}

export function useListChannels() {
  const { session } = useSession();
  return useQuery({
    queryKey: queryKeys.channels,
    enabled: session !== null,
    queryFn: () =>
      callRelay<ToolsAtmoNotifsListChannels.$output>(session!, nsid('listChannels'), null, 'GET'),
  });
}

export function useGetSettings() {
  const { session } = useSession();
  return useQuery({
    queryKey: queryKeys.settings,
    enabled: session !== null,
    queryFn: () =>
      callRelay<ToolsAtmoNotifsGetSettings.$output>(session!, nsid('getSettings'), null, 'GET'),
  });
}

export function useListNotifications(filter?: { senderDid?: string }) {
  const { session } = useSession();
  return useQuery({
    queryKey: queryKeys.notifications(filter?.senderDid),
    enabled: session !== null,
    queryFn: () =>
      callRelay<ToolsAtmoNotifsListNotifications.$output>(
        session!,
        nsid('listNotifications'),
        filter?.senderDid ? { senderDid: filter.senderDid } : null,
        'GET',
      ),
  });
}

// --- mutations -------------------------------------------------------------

export function useGrant() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToolsAtmoNotifsGrant.$input) =>
      callRelay(session!, nsid('grant'), input, 'POST'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.pending });
      void qc.invalidateQueries({ queryKey: queryKeys.grants });
    },
  });
}

export function useDenyPending() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToolsAtmoNotifsDenyPending.$input) =>
      callRelay(session!, nsid('denyPending'), input, 'POST'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.pending }),
  });
}

export function useRevoke() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToolsAtmoNotifsRevoke.$input) =>
      callRelay(session!, nsid('revoke'), input, 'POST'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.grants }),
  });
}

export function useMuteGrant() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToolsAtmoNotifsMuteGrant.$input) =>
      callRelay(session!, nsid('muteGrant'), input, 'POST'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.grants }),
  });
}

export function useUpdateSettings() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { notifyPendingViaTelegram: boolean }) =>
      callRelay(session!, nsid('updateSettings'), input, 'POST'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
}

export function useUnlinkChannel() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { deviceId: string }) =>
      callRelay(session!, nsid('unlinkChannel'), input, 'POST'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.channels }),
  });
}

/** Returns the Telegram deep link to open. */
export function useLinkTelegram() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      callRelay<{ token: string; deepLink: string }>(
        session!,
        nsid('linkChannel'),
        { platform: 'telegram' },
        'POST',
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.channels }),
  });
}
