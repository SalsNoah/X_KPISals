import { describe, expect, it } from 'vitest';
import { computeKpis } from './kpi';
import type { KpiData, Snapshot } from './types';

// 2026-09-29(火) 11:30 JST
const NOW = new Date('2026-09-29T02:30:00Z');
const THIS_WEEK = '2026-09-27T15:00:00.000Z';
const LAST_WEEK = '2026-09-20T15:00:00.000Z';

function snap(at: string, followers: number, extra: Partial<Snapshot> = {}): Snapshot {
  return { at, followers, weeklyLikes: null, weeklyPosts: null, weekStart: THIS_WEEK, ...extra };
}

function data(snapshots: Snapshot[], status: Partial<KpiData['status']> = {}): KpiData {
  const last = snapshots.at(-1)?.at ?? null;
  return {
    version: 1,
    username: 'Sals_mj',
    snapshots,
    status: { lastAttemptAt: last, lastSuccessAt: last, error: null, ...status },
  };
}

describe('computeKpis', () => {
  const normal = data([
    snap('2026-08-31T12:00:00Z', 8_600, { weekStart: '2026-08-30T15:00:00.000Z' }), // 8/31 21:00 JST
    snap('2026-09-28T23:00:00Z', 8_900, { weeklyLikes: 1_500, weeklyPosts: 20 }),
    snap('2026-09-29T02:00:00Z', 8_912), // いいねの取得だけ失敗した回
  ]);

  it('現在のフォロワーと前回からの増減', () => {
    const k = computeKpis(normal, NOW);
    expect(k.current).toMatchObject({ followers: 8_912, delta: 12 });
    expect(k.current?.previous?.at).toBe('2026-09-28T23:00:00Z');
  });

  it('月初直前の記録を月初の値として純増を出す', () => {
    const k = computeKpis(normal, NOW);
    expect(k.month.net).toBe(312);
    expect(k.month.rate).toBeCloseTo(0.39);
    expect(k.month.baseline).toMatchObject({ followers: 8_600, exact: true });
  });

  it('月初のデータが無ければ今月最初の記録から数える', () => {
    const k = computeKpis(
      data([snap('2026-07-01T00:00:00Z', 7_000), snap('2026-09-10T00:00:00Z', 8_500), snap('2026-09-29T02:00:00Z', 8_700)]),
      NOW,
    );
    expect(k.month.net).toBe(200);
    expect(k.month.baseline).toMatchObject({ followers: 8_500, exact: false });
  });

  it('今月の記録が1件もなければ純増は出さない', () => {
    const k = computeKpis(data([snap('2026-08-20T00:00:00Z', 8_000)]), NOW);
    expect(k.month.net).toBeNull();
    expect(k.month.baseline).toBeNull();
  });

  it('長期目標の達成率・残り人数・必要ペース', () => {
    const [year, end2027] = computeKpis(normal, NOW).milestones;
    expect(year).toMatchObject({ target: 10_000, remaining: 1_088, daysLeft: 94 });
    expect(year.rate).toBeCloseTo(0.8912);
    expect(year.perDay).toBeCloseTo(1_088 / 94);
    expect(end2027).toMatchObject({ target: 20_000, remaining: 11_088 });
  });

  it('達成済みなら残りは0で必要ペースなし', () => {
    const [year] = computeKpis(data([snap('2026-09-29T02:00:00Z', 10_250)]), NOW).milestones;
    expect(year.remaining).toBe(0);
    expect(year.perDay).toBeNull();
    expect(year.rate).toBeGreaterThan(1);
  });

  it('週間いいねは今週分で取得に成功した最新の記録を使う', () => {
    const w = computeKpis(normal, NOW).weeklyLikes;
    expect(w).toMatchObject({ likes: 1_500, posts: 20, target: 3_000, measuredAt: '2026-09-28T23:00:00Z' });
    expect(w.rate).toBeCloseTo(0.5);
  });

  it('先週分しか無ければ週間いいねは未取得扱い', () => {
    const w = computeKpis(
      data([snap('2026-09-27T14:00:00Z', 8_900, { weeklyLikes: 2_800, weekStart: LAST_WEEK })]),
      NOW,
    ).weeklyLikes;
    expect(w.likes).toBeNull();
    expect(w.weekStart).toBe(THIS_WEEK);
  });

  it('最終取得から8時間を超えたら古いと判定', () => {
    expect(computeKpis(normal, NOW).status.stale).toBe(false);
    const old = data([snap('2026-09-28T17:00:00Z', 8_900)]);
    expect(computeKpis(old, NOW).status.stale).toBe(true);
    expect(computeKpis(data([]), NOW).status.stale).toBe(true);
  });

  it('記録が無くても落ちない', () => {
    const k = computeKpis(data([], { error: { at: NOW.toISOString(), message: 'X_BEARER_TOKEN が設定されていません' } }), NOW);
    expect(k.current).toBeNull();
    expect(k.month.net).toBeNull();
    expect(k.milestones[0].rate).toBeNull();
    expect(k.status.error?.message).toContain('X_BEARER_TOKEN');
  });
});
