import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { Spinner } from '../components/Spinner';
import { useSession } from '../lib/auth/session';
import { hasPushPermission } from '../lib/push/register';

export default function Index() {
  const { session, restoring } = useSession();
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (session !== null) {
      void hasPushPermission().then(setPushGranted);
    }
  }, [session]);

  if (restoring) {
    return <Spinner fill />;
  }
  if (session === null) {
    return <Redirect href="/onboarding/welcome" />;
  }
  if (pushGranted === null) {
    return <Spinner fill />;
  }
  if (!pushGranted) {
    return <Redirect href="/onboarding/permissions" />;
  }
  return <Redirect href="/(auth)/(tabs)/inbox" />;
}
