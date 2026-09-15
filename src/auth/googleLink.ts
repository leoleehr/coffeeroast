/**
 * Persisted Google authorization used for the Google Drive backup.
 *
 * We sign in through Supabase's Google provider; the resulting session carries a
 * Google `provider_token` (and, when we ask for offline access, a
 * `provider_refresh_token`). Supabase does NOT refresh the provider token for us,
 * so we stash it here and, once it expires, ask the user to reconnect.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

const LINK_KEY = 'gdrive.link';

export type GoogleLink = {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms */
  expiresAt: number;
  email: string | null;
};

/** Treat the token as expired this many ms early, to avoid racing the clock. */
const EXPIRY_SKEW_MS = 60_000;

let cache: GoogleLink | null | undefined;

export async function loadGoogleLink(): Promise<GoogleLink | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await AsyncStorage.getItem(LINK_KEY);
    cache = raw ? (JSON.parse(raw) as GoogleLink) : null;
  } catch {
    cache = null;
  }
  return cache;
}

export async function saveGoogleLink(link: GoogleLink): Promise<void> {
  cache = link;
  try {
    await AsyncStorage.setItem(LINK_KEY, JSON.stringify(link));
  } catch {
    // best effort — an unwritable store just means we re-prompt sooner
  }
}

export async function clearGoogleLink(): Promise<void> {
  cache = null;
  try {
    await AsyncStorage.removeItem(LINK_KEY);
  } catch {
    // ignore
  }
}

/**
 * Pull the Google provider token out of a fresh Supabase session and persist it.
 * Returns the stored link, or null if the session had no provider token (e.g. an
 * email/password sign-in, or a later token refresh that drops provider_token).
 */
export async function captureFromSession(session: Session | null): Promise<GoogleLink | null> {
  const accessToken = session?.provider_token;
  if (!session || !accessToken) return null;

  const existing = await loadGoogleLink();
  const link: GoogleLink = {
    accessToken,
    // A refresh is only handed back on the first consent; keep the old one otherwise.
    refreshToken: session.provider_refresh_token ?? existing?.refreshToken ?? null,
    expiresAt: Date.now() + 3600_000,
    email: session.user?.email ?? existing?.email ?? null,
  };
  await saveGoogleLink(link);
  return link;
}

/** The current access token if it is still valid, otherwise null. */
export async function getValidAccessToken(): Promise<string | null> {
  const link = await loadGoogleLink();
  if (!link) return null;
  if (Date.now() + EXPIRY_SKEW_MS >= link.expiresAt) return null;
  return link.accessToken;
}
