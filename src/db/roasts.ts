import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getValidAccessToken } from '@/auth/googleLink';
import { demo, isDemoMode } from '@/demo/demoStore';
import { upsertRoastJson } from '@/lib/googleDrive';
import { qk } from '@/lib/queryClient';
import { setBackupEntry } from '@/lib/roastBackup';
import { supabase } from '@/lib/supabase';

import {
  curvePointsFromRows,
  eventColumnsFromEvents,
  type CurvePoint,
  type RoastBatchRow,
  type RoastBatchWithBean,
  type RoastCurvePointRow,
  type RoastEvent,
} from './types';

export type SaveRoastPayload = {
  beanId: string | null;
  beanLotId: string | null;
  beanName: string;
  roasterName: string;
  startedAt: number;
  greenWeightG: number | null;
  roastedWeightG: number | null;
  roastLevel: string | null;
  notes: string | null;
  points: CurvePoint[];
  events: RoastEvent[];
};

export function useRoastBatches() {
  return useQuery({
    queryKey: qk.roastBatches,
    queryFn: async (): Promise<RoastBatchWithBean[]> => {
      if (isDemoMode) return demo.listBatches();
      const { data, error } = await supabase
        .from('roast_batches')
        .select('*, green_beans(id, name_zh, name_en)')
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RoastBatchWithBean[];
    },
  });
}

export function useRoastBatch(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.roastBatch(id) : ['roast_batches', 'none'],
    enabled: !!id,
    queryFn: async (): Promise<RoastBatchWithBean | null> => {
      if (isDemoMode) return demo.getBatch(id!);
      const { data, error } = await supabase
        .from('roast_batches')
        .select('*, green_beans(id, name_zh, name_en)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as RoastBatchWithBean | null;
    },
  });
}

export function useRoastCurve(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.roastCurve(id) : ['roast_curve', 'none'],
    enabled: !!id,
    queryFn: async (): Promise<CurvePoint[]> => {
      if (isDemoMode) return demo.getCurve(id!);
      const { data, error } = await supabase
        .from('roast_curve_points')
        .select('*')
        .eq('batch_id', id)
        .order('t_sec', { ascending: true });
      if (error) throw error;
      return curvePointsFromRows((data ?? []) as RoastCurvePointRow[]);
    },
  });
}

export function useStats() {
  return useQuery({
    queryKey: qk.stats,
    queryFn: async () => {
      if (isDemoMode) return demo.stats();
      const [batches, beans] = await Promise.all([
        supabase.from('roast_batches').select('id', { count: 'exact', head: true }),
        supabase.from('green_beans').select('id', { count: 'exact', head: true }).eq('archived', false),
      ]);
      return {
        roasts: batches.count ?? 0,
        beans: beans.count ?? 0,
      };
    },
  });
}

export function useSaveRoast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveRoastPayload): Promise<RoastBatchRow> => {
      if (isDemoMode) return demo.saveRoast(payload);
      const drop = payload.events.find((e) => e.kind === 'drop');
      const startedAtIso = new Date(payload.startedAt).toISOString();
      const batchNo = buildBatchNo(payload.startedAt);

      const insert: Record<string, unknown> = {
        batch_no: batchNo,
        green_bean_id: payload.beanId,
        green_bean_lot_id: payload.beanLotId,
        bean_name_snapshot: payload.beanName || null,
        status: 'completed',
        started_at: startedAtIso,
        charge_temp: payload.points[0]?.beanTemp ?? null,
        weight_green_g: payload.greenWeightG,
        weight_roasted_g: payload.roastedWeightG,
        roast_level: payload.roastLevel,
        notes: payload.notes,
        drop_sec: drop?.tSec ?? payload.points[payload.points.length - 1]?.tSec ?? null,
        ...eventColumnsFromEvents(payload.events),
      };

      const { data: batch, error: batchErr } = await supabase
        .from('roast_batches')
        .insert(insert)
        .select('*')
        .single();
      if (batchErr) throw batchErr;

      if (payload.points.length > 0) {
        const rows = payload.points.map((p) => ({
          batch_id: batch.id,
          t_sec: p.tSec,
          bean_temp: p.beanTemp,
          drum_temp: p.drumTemp ?? null,
          gas: p.gas ?? null,
          airflow: p.airflow ?? null,
        }));
        // chunk to keep payloads small
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from('roast_curve_points').insert(rows.slice(i, i + 500));
          if (error) throw error;
        }
      }

      // Inventory side-effects (best effort — a failure here must not lose the roast).
      if (payload.beanLotId && payload.greenWeightG && payload.greenWeightG > 0) {
        await supabase
          .rpc('consume_green_lot', { p_lot_id: payload.beanLotId, p_grams: payload.greenWeightG })
          .then(({ error }) => {
            if (error) console.warn('consume_green_lot failed', error.message);
          });
      }
      if (payload.roastedWeightG && payload.roastedWeightG > 0) {
        await supabase
          .from('roasted_stock_moves')
          .insert({
            batch_id: batch.id,
            green_bean_id: payload.beanId,
            direction: 'in',
            qty_g: payload.roastedWeightG,
            reason: 'roast',
          })
          .then(({ error }) => {
            if (error) console.warn('roasted_stock_moves insert failed', error.message);
          });
      }

      // Google Drive backup (best effort — never let a backup failure lose the
      // roast). Silently skipped when Google isn't linked or the token expired;
      // the user can re-run it from Settings.
      try {
        const token = await getValidAccessToken();
        if (token) {
          const { fileId } = await upsertRoastJson(token, {
            batch: batch as RoastBatchRow,
            curvePoints: payload.points,
            events: payload.events,
          });
          await setBackupEntry(batch.id, { fileId, syncedAt: Date.now() });
        }
      } catch (e) {
        console.warn('gdrive backup failed', e instanceof Error ? e.message : e);
      }

      return batch;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.roastBatches });
      qc.invalidateQueries({ queryKey: qk.stats });
      qc.invalidateQueries({ queryKey: qk.greenStock });
      qc.invalidateQueries({ queryKey: qk.roastedStock });
      qc.invalidateQueries({ queryKey: qk.roastedMoves });
    },
  });
}

export function useDeleteRoastBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return demo.deleteBatch(id);
      const { error } = await supabase.from('roast_batches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.roastBatches });
      qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}

function buildBatchNo(startedAt: number): string {
  const d = new Date(startedAt);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}`;
}
