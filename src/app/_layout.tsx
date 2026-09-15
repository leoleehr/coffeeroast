import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { SensorProvider } from '@/sensors/SensorProvider';
import { queryClient } from '@/lib/queryClient';
import { t } from '@/i18n/zh-TW';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading, session, configured } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();
    if (!configured) return;
    const inAuthGroup = segments[0] === '(auth)';
    // The OAuth redirect target resolves its own navigation once the session lands.
    if ((segments[0] as string) === 'auth') return;
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [loading, session, configured, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="roast" />
      <Stack.Screen name="suppliers" />
      <Stack.Screen name="blends" />
      <Stack.Screen name="stock" />
      <Stack.Screen name="beans/new" options={{ headerShown: true, title: t.beans.newTitle, presentation: 'modal' }} />
      <Stack.Screen name="beans/[id]" options={{ headerShown: true }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SensorProvider>
              <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
                <StatusBar style="auto" />
                <RootNavigator />
              </ThemeProvider>
            </SensorProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
