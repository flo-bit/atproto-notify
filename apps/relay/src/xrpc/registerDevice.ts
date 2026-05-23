import { ToolsAtmoNotifsRegisterDevice } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { newDeviceId } from '../lib/ids';
import { now } from '../lib/time';

const LXM = 'tools.atmo.notifs.registerDevice';

export function makeRegisterDevice(
  app: AppContext,
): ProcedureConfig<ToolsAtmoNotifsRegisterDevice.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);
      // `platform` is constrained to "ios" | "android" by the lexicon enum.
      const displayName = input.deviceName ?? null;

      await q.ensureUser(app.env.DB, userDid, now());

      // A push token is unique per platform. If we already know this token:
      const existing = await q.getChannelByPlatformUser(app.env.DB, input.platform, input.token);
      if (existing !== null) {
        if (existing.did === userDid) {
          // Same device, same user — just refresh metadata, keep the device id.
          await q.touchChannel(app.env.DB, {
            did: userDid,
            deviceId: existing.device_id,
            displayName,
            linkedAt: now(),
          });
          return json({ deviceId: existing.device_id });
        }
        // Token reassigned to a different user (device changed hands): drop the
        // stale row so the unique (platform, token) index is free to reinsert.
        await q.deleteChannelByPlatformUser(app.env.DB, input.platform, input.token);
      }

      const deviceId = newDeviceId();
      await q.upsertChannel(app.env.DB, {
        deviceId,
        did: userDid,
        platform: input.platform,
        platformUserId: input.token,
        displayName,
        linkedAt: now(),
      });
      return json({ deviceId });
    },
  };
}
