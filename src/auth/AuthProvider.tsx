import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import {
  captureFromSession,
  clearGoogleLink,
  loadGoogleLink,
  type GoogleLink,
} from './googleLink';

// Lets the web popup/redirect hand control back cleanly; a no-op on native.
WebBrowser.maybeCompleteAuthSession();

/** Drive backup wants per-file access to files it creates. */
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file';

type GoogleDriveState = { connected: boolean; email: string | null };

type AuthState = {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  configured: boolean;
  googleDrive: GoogleDriveState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ needsConfirm: boolean }>;
  signInWithGoogle: () => Promise<void>;
  connectGoogleDrive: () => Promise<void>;
  disconnectGoogleDrive: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function linkToState(link: GoogleLink | null): GoogleDriveState {
  return { connected: !!link, email: link?.email ?? null };
}

/**
 * Drive the Google OAuth flow through Supabase's provider. On web this navigates
 * the page away and the session is picked up on return via onAuthStateChange; on
 * native we open a browser tab and exchange the returned code ourselves.
 */
async function runGoogleOAuth(): Promise<void> {
  const redirectTo = Linking.createURL('/auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: GOOGLE_SCOPES,
      // access_type=offline + prompt=consent so the session carries a Google
      // provider_refresh_token, not just a 1-hour access token.
      queryParams: { access_type: 'offline', prompt: 'consent' },
      skipBrowserRedirect: Platform.OS !== 'web',
    },
  });
  if (error) throw error;

  if (Platform.OS === 'web' || !data?.url) return; // web redirects; return handled on reload

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error('cancelled');

  const parsed = Linking.parse(result.url);
  const code = parsed.queryParams?.code;
  if (!code) throw new Error('no authorization code in redirect');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(String(code));
  if (exchangeError) throw exchangeError;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleDrive, setGoogleDrive] = useState<GoogleDriveState>({ connected: false, email: null });

  useEffect(() => {
    loadGoogleLink().then((link) => setGoogleDrive(linkToState(link)));

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_IN' && next?.provider_token) {
        captureFromSession(next).then((link) => setGoogleDrive(linkToState(link)));
      } else if (event === 'SIGNED_OUT') {
        clearGoogleLink().then(() => setGoogleDrive({ connected: false, email: null }));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await runGoogleOAuth();
    // Native: the session is now set; capture immediately (web already reloaded).
    const { data } = await supabase.auth.getSession();
    if (data.session?.provider_token) {
      const link = await captureFromSession(data.session);
      setGoogleDrive(linkToState(link));
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      loading,
      configured: isSupabaseConfigured,
      googleDrive,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUp(email, password, displayName) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (error) throw error;
        return { needsConfirm: !data.session };
      },
      signInWithGoogle,
      connectGoogleDrive: signInWithGoogle,
      async disconnectGoogleDrive() {
        await clearGoogleLink();
        setGoogleDrive({ connected: false, email: null });
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, googleDrive, signInWithGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
