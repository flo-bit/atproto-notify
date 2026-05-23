import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { OAuthSession } from '../auth/client';
import { LEXICON_PREFIX } from '../config';
import { callRelay } from '../relay/client';

const PUSH_TOKEN_KEY = 'pushToken';
const DEVICE_ID_KEY = 'deviceId';

function getDeviceName(): string {
  const name = Device.deviceName ?? Device.modelName ?? 'Device';
  const os = `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim();
  return os ? `${name} · ${os}` : name;
}

/**
 * Ensure this device is registered for push with the relay. Idempotent + cheap to
 * call on every launch. Returns the deviceId, or null if permission was denied.
 */
export async function ensurePushRegistered(
  session: OAuthSession,
): Promise<{ deviceId: string } | null> {
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') {
    return null;
  }

  // The *native* APNs/FCM token (intentionally not the Expo push token).
  const tokenResponse = await Notifications.getDevicePushTokenAsync();
  const token = String(tokenResponse.data);

  const [storedToken, storedDeviceId] = await Promise.all([
    SecureStore.getItemAsync(PUSH_TOKEN_KEY),
    SecureStore.getItemAsync(DEVICE_ID_KEY),
  ]);
  if (storedToken === token && storedDeviceId !== null) {
    return { deviceId: storedDeviceId };
  }

  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await callRelay<{ deviceId: string }>(
    session,
    `${LEXICON_PREFIX}.registerDevice`,
    { platform, token, deviceName: getDeviceName() },
    'POST',
  );

  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  await SecureStore.setItemAsync(DEVICE_ID_KEY, res.deviceId);
  return { deviceId: res.deviceId };
}

/** The deviceId stored at last successful registration (to label "this device"). */
export async function getStoredDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

/** Whether the OS notification permission is currently granted. */
export async function hasPushPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}
