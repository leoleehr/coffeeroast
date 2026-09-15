/**
 * Minimal Google Drive REST client for backing up roast records.
 *
 * Uses the `drive.file` scope: the app can only see and touch files it created
 * itself, which keeps the OAuth consent screen out of Google's sensitive-scope
 * review. Files land in a visible folder in the user's Drive so they can browse
 * and download the JSON themselves.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CurvePoint, RoastBatchRow, RoastEvent } from '@/db/types';

export const DRIVE_FOLDER_NAME = '畫素微量烘焙咖啡';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FOLDER_ID_KEY = 'gdrive.folderId';

/** Thrown on a 401 so callers can prompt the user to reconnect Google. */
export class GoogleAuthExpiredError extends Error {
  constructor() {
    super('Google authorization expired');
    this.name = 'GoogleAuthExpiredError';
  }
}

export type RoastBackupPayload = {
  batch: RoastBatchRow;
  curvePoints: CurvePoint[];
  events: RoastEvent[];
};

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new GoogleAuthExpiredError();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

let folderIdCache: string | null = null;

export async function ensureFolder(token: string): Promise<string> {
  if (folderIdCache) return folderIdCache;
  try {
    const stored = await AsyncStorage.getItem(FOLDER_ID_KEY);
    if (stored) {
      folderIdCache = stored;
      return stored;
    }
  } catch {
    // ignore
  }

  const q = `name='${DRIVE_FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false and 'me' in owners`;
  const found = await driveFetch(
    token,
    `${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
  ).then((r) => r.json() as Promise<{ files: { id: string }[] }>);

  let id = found.files?.[0]?.id;
  if (!id) {
    const created = await driveFetch(token, FILES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME }),
    }).then((r) => r.json() as Promise<{ id: string }>);
    id = created.id;
  }

  folderIdCache = id;
  try {
    await AsyncStorage.setItem(FOLDER_ID_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

export function roastFileName(batchId: string): string {
  return `roast-${batchId}.json`;
}

async function findFile(token: string, name: string, folderId: string): Promise<string | null> {
  const q = `name='${name}' and '${folderId}' in parents and trashed=false`;
  const res = await driveFetch(
    token,
    `${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
  ).then((r) => r.json() as Promise<{ files: { id: string }[] }>);
  return res.files?.[0]?.id ?? null;
}

function buildRoastJson(payload: RoastBackupPayload): string {
  return JSON.stringify(
    {
      schema: 'coffeeroast.roast/v1',
      exportedAt: new Date().toISOString(),
      batch: payload.batch,
      curve: payload.curvePoints,
      events: payload.events,
    },
    null,
    2,
  );
}

/**
 * Create or update the Drive JSON file for one roast batch. Returns the Drive
 * file id. Safe to call repeatedly — an existing file is updated in place.
 */
export async function upsertRoastJson(
  token: string,
  payload: RoastBackupPayload,
): Promise<{ fileId: string }> {
  const folderId = await ensureFolder(token);
  const name = roastFileName(payload.batch.id);
  const media = buildRoastJson(payload);
  const existingId = await findFile(token, name, folderId);

  if (existingId) {
    await driveFetch(token, `${UPLOAD_URL}/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: media,
    });
    return { fileId: existingId };
  }

  const boundary = `coffeeroast-${Date.now()}`;
  const metadata = JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${media}\r\n` +
    `--${boundary}--`;

  const created = await driveFetch(token, `${UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  }).then((r) => r.json() as Promise<{ id: string }>);

  return { fileId: created.id };
}
