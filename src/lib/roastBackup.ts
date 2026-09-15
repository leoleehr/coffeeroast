/**
 * Local record of which roast batches have been backed up to Google Drive, and
 * as which Drive file. Kept in AsyncStorage so we don't touch the Supabase
 * schema; the trade-off is that the "backed up" state is per-device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const INDEX_KEY = 'gdrive.backupIndex';

export type BackupEntry = {
  fileId: string;
  /** epoch ms */
  syncedAt: number;
};

export type BackupIndex = Record<string, BackupEntry>;

let cache: BackupIndex | undefined;

export async function getBackupIndex(): Promise<BackupIndex> {
  if (cache !== undefined) return cache;
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    cache = raw ? (JSON.parse(raw) as BackupIndex) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function write(index: BackupIndex): Promise<void> {
  cache = index;
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // best effort
  }
}

export async function setBackupEntry(batchId: string, entry: BackupEntry): Promise<void> {
  const index = { ...(await getBackupIndex()), [batchId]: entry };
  await write(index);
}

export async function removeBackupEntry(batchId: string): Promise<void> {
  const index = { ...(await getBackupIndex()) };
  delete index[batchId];
  await write(index);
}

export async function clearBackupIndex(): Promise<void> {
  await write({});
}

/** Most recent syncedAt across all entries, or null if nothing is backed up. */
export async function lastBackupAt(): Promise<number | null> {
  const index = await getBackupIndex();
  const times = Object.values(index).map((e) => e.syncedAt);
  return times.length ? Math.max(...times) : null;
}
