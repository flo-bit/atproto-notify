import type { DeliveryInstance } from '../db/queries';
import type { DeliveryChannel } from '../env';

/** Map a resolved delivery instance to its dispatch-queue channel descriptor. */
export function deliveryChannelFor(target: DeliveryInstance): DeliveryChannel {
  switch (target.channel) {
    case 'push':
      return {
        platform: 'webpush',
        endpoint: target.endpoint,
        p256dh: target.p256dh,
        auth: target.auth,
      };
    case 'telegram':
      return { platform: 'telegram', platformUserId: target.chatId };
    case 'email':
      return { platform: 'email', address: target.address };
    case 'dm':
      return { platform: 'dm', recipientDid: target.recipientDid };
    case 'webhook':
      return { platform: 'webhook', url: target.url };
  }
}

/** Resolve a user's verified delivery targets that a route selection fires. */
import type { RouteSelection } from '@atmo/notifs-lexicons';
import type { DeliveryTargetRow } from '../db/queries';
import { toDeliveryInstance } from '../db/queries';

export function selectTargets(
  rows: DeliveryTargetRow[],
  selection: RouteSelection,
): DeliveryInstance[] {
  return rows
    .map(toDeliveryInstance)
    .filter((t): t is DeliveryInstance => t !== null && t.verified)
    .filter((t) => {
      const sel = selection[t.channel];
      return sel !== undefined && (sel.all || sel.ids.includes(t.id));
    });
}
