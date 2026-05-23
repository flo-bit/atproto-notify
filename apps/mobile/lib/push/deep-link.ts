import type * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { insertNotification } from '../db/notifications';

/** The custom data we attach to every push (see relay dispatcher payloads). */
export interface NotifData {
  senderDid?: string;
  senderHandle?: string;
  notifId?: string;
  uri?: string;
}

function readData(notification: Notifications.Notification): NotifData {
  return (notification.request.content.data ?? {}) as NotifData;
}

/** Navigate to a notification's detail screen (after the auth gate has resolved). */
export function routeToNotification(data: NotifData): void {
  if (data.notifId !== undefined && data.notifId !== '') {
    router.push(`/notif/${data.notifId}`);
  }
}

export function routeToNotificationResponse(response: Notifications.NotificationResponse): void {
  routeToNotification(readData(response.notification));
}

/**
 * Persist a foreground-received push into the local inbox so it shows up
 * immediately (the periodic sync would otherwise catch it later).
 */
export async function insertForegroundNotification(
  notification: Notifications.Notification,
): Promise<void> {
  const content = notification.request.content;
  const data = readData(notification);
  if (data.notifId === undefined || data.notifId === '') {
    return;
  }
  await insertNotification({
    id: data.notifId,
    senderDid: data.senderDid ?? 'did:unknown',
    senderHandle: data.senderHandle ?? null,
    title: content.title ?? '',
    body: content.body ?? '',
    uri: data.uri ?? null,
    createdAt: Date.now(),
  });
}
