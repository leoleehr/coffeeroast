import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * OAuth redirect lands here. On web, supabase-js (detectSessionInUrl) has
 * already turned the ?code= into a session by the time this mounts; on native
 * the exchange happens in AuthProvider. Either way we just wait for the session
 * and bounce to the app.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const go = (path: '/(tabs)' | '/(auth)/sign-in') => {
      if (!cancelled) router.replace(path);
    };
    supabase.auth.getSession().then(({ data }) => {
      go(data.session ? '/(tabs)' : '/(auth)/sign-in');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go('/(tabs)');
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
