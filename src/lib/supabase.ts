import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './env';

/**
 * A single shared client. When Supabase isn't configured yet we still create a
 * client with dummy values so imports don't crash — every call site checks
 * `isSupabaseConfigured` first and shows a setup hint instead.
 */
export const supabase = createClient(
  // When unconfigured, point at a host that refuses instantly so queries fail
  // fast and screens fall back to their empty/setup state instead of hanging.
  isSupabaseConfigured ? SUPABASE_URL : 'http://127.0.0.1:9',
  isSupabaseConfigured ? SUPABASE_ANON_KEY : 'placeholder-anon-key',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      // PKCE so the native OAuth flow can call exchangeCodeForSession(); the web
      // flow (detectSessionInUrl) handles the ?code= param on its own.
      flowType: 'pkce',
    },
  },
);

export { isSupabaseConfigured };
