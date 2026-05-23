import { ToolsAtmoNotifsLinkChannel } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { newLinkToken } from '../lib/ids';
import { addMinutes, now } from '../lib/time';

const LXM = 'tools.atmo.notifs.linkChannel';

export function makeLinkChannel(
  app: AppContext,
): ProcedureConfig<ToolsAtmoNotifsLinkChannel.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);

      await q.ensureUser(app.env.DB, userDid, now());
      const token = newLinkToken();
      await q.insertLinkToken(app.env.DB, {
        token,
        did: userDid,
        platform: input.platform,
        expiresAt: addMinutes(now(), 10),
      });

      const deepLink = `https://t.me/${app.env.BOT_USERNAME}?start=${token}`;
      return json({ token, deepLink });
    },
  };
}
