// MUST match the JSON served at:
//   https://notify.atmo.tools/mobile/oauth-client-metadata.json
//   (apps/web/static/mobile/oauth-client-metadata.json)
// If these diverge the OAuth flow breaks. Change both together + bump the app
// version.
export const clientMetadata = {
  client_id: 'https://notify.atmo.tools/mobile/oauth-client-metadata.json',
  client_name: 'notify.atmo.tools',
  client_uri: 'https://notify.atmo.tools',
  redirect_uris: ['tools.atmo.notify://oauth/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope:
    'atproto rpc?lxm=tools.atmo.notifs.grant&lxm=tools.atmo.notifs.revoke&lxm=tools.atmo.notifs.denyPending&lxm=tools.atmo.notifs.muteGrant&lxm=tools.atmo.notifs.listGrants&lxm=tools.atmo.notifs.listPending&lxm=tools.atmo.notifs.linkChannel&lxm=tools.atmo.notifs.unlinkChannel&lxm=tools.atmo.notifs.listChannels&lxm=tools.atmo.notifs.getSettings&lxm=tools.atmo.notifs.updateSettings&lxm=tools.atmo.notifs.registerDevice&lxm=tools.atmo.notifs.listNotifications&aud=*',
  token_endpoint_auth_method: 'none',
  application_type: 'native',
  dpop_bound_access_tokens: true,
} as const;
