import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { getValidAccessToken } from '@/auth/googleLink';
import { AppText, Button, Card, Row } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { GoogleAuthExpiredError, upsertRoastJson } from '@/lib/googleDrive';
import { lastBackupAt, setBackupEntry } from '@/lib/roastBackup';
import { supabase } from '@/lib/supabase';
import { t } from '@/i18n/zh-TW';
import {
  curvePointsFromRows,
  eventsFromBatch,
  type RoastBatchRow,
  type RoastCurvePointRow,
} from '@/db/types';

type Status = { kind: 'idle' | 'busy' | 'done' | 'error' | 'expired'; text?: string };

export function GoogleDriveSettings() {
  const { googleDrive, connectGoogleDrive, disconnectGoogleDrive } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [lastAt, setLastAt] = useState<number | null>(null);

  const refreshLast = () => lastBackupAt().then(setLastAt);
  useEffect(() => {
    refreshLast();
  }, [googleDrive.connected, status.kind]);

  const connect = async () => {
    setStatus({ kind: 'busy' });
    try {
      await connectGoogleDrive();
      setStatus({ kind: 'idle' });
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') setStatus({ kind: 'idle' });
      else setStatus({ kind: 'error', text: t.errors.googleSignIn });
    }
  };

  const backup = async (mode: 'latest' | 'all') => {
    setStatus({ kind: 'busy', text: t.settings.backupInProgress });
    try {
      const token = await getValidAccessToken();
      if (!token) {
        setStatus({ kind: 'expired', text: t.settings.googleExpired });
        return;
      }

      const { data, error } = await supabase
        .from('roast_batches')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(mode === 'latest' ? 1 : 1000);
      if (error) throw error;
      const batches = (data ?? []) as RoastBatchRow[];
      if (batches.length === 0) {
        setStatus({ kind: 'done', text: t.settings.nothingToBackUp });
        return;
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        setStatus({ kind: 'busy', text: `${t.settings.backupInProgress} ${i + 1}/${batches.length}` });
        const { data: curveRows } = await supabase
          .from('roast_curve_points')
          .select('*')
          .eq('batch_id', batch.id)
          .order('t_sec', { ascending: true });
        const { fileId } = await upsertRoastJson(token, {
          batch,
          curvePoints: curvePointsFromRows((curveRows ?? []) as RoastCurvePointRow[]),
          events: eventsFromBatch(batch),
        });
        await setBackupEntry(batch.id, { fileId, syncedAt: Date.now() });
      }
      await refreshLast();
      setStatus({ kind: 'done', text: t.settings.backupDone });
    } catch (e) {
      if (e instanceof GoogleAuthExpiredError) setStatus({ kind: 'expired', text: t.settings.googleExpired });
      else setStatus({ kind: 'error', text: t.settings.backupFailed });
    }
  };

  const busy = status.kind === 'busy';

  return (
    <Card>
      <AppText variant="label" color="textSecondary">
        {t.settings.googleDrive}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {t.settings.googleDriveDesc}
      </AppText>

      {googleDrive.connected ? (
        <>
          <Row style={{ justifyContent: 'space-between', marginTop: Spacing.one }}>
            <AppText color="textSecondary">{t.settings.googleConnected}</AppText>
            <AppText>{googleDrive.email ?? '—'}</AppText>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText color="textSecondary">{t.settings.lastBackup}</AppText>
            <AppText>{lastAt ? dayjs(lastAt).format('YYYY-MM-DD HH:mm') : t.settings.neverBackedUp}</AppText>
          </Row>

          {status.text ? (
            <AppText
              variant="caption"
              color={status.kind === 'error' || status.kind === 'expired' ? 'danger' : 'textSecondary'}>
              {status.text}
            </AppText>
          ) : null}

          <View style={{ gap: Spacing.two, marginTop: Spacing.one }}>
            <Button label={t.settings.backupNow} variant="secondary" onPress={() => backup('latest')} loading={busy} />
            <Button label={t.settings.backupAll} variant="secondary" onPress={() => backup('all')} loading={busy} />
            {status.kind === 'expired' ? (
              <Button label={t.settings.googleReconnect} onPress={connect} loading={busy} />
            ) : null}
            <Button label={t.settings.googleDisconnect} variant="ghost" onPress={disconnectGoogleDrive} />
          </View>
        </>
      ) : (
        <>
          {status.text ? (
            <AppText variant="caption" color="danger">
              {status.text}
            </AppText>
          ) : null}
          <Button
            label={t.settings.googleConnect}
            variant="secondary"
            onPress={connect}
            loading={busy}
            style={{ marginTop: Spacing.one }}
          />
        </>
      )}
    </Card>
  );
}
