import { GOALS, STALE_AFTER_HOURS } from '../config';
import type { KpiData, Snapshot } from './types';
import { DAY_MS, daysLeftUntil, monthStartJst, weekStartJst } from './time';

export interface CurrentFollowers {
  followers: number;
  at: string;
  previous: { followers: number; at: string } | null;
  /** 前回取得からの増減。初回は null */
  delta: number | null;
}

export interface MonthlyNet {
  /** 月初との差。今月のデータがまだ無ければ null */
  net: number | null;
  target: number;
  rate: number | null;
  baseline: {
    followers: number;
    at: string;
    /** true: 月初時点の値 / false: 月初のデータが無く、今月最初の取得値で代用 */
    exact: boolean;
  } | null;
}

export interface MilestoneKpi {
  id: string;
  label: string;
  target: number;
  deadline: string;
  rate: number | null;
  remaining: number | null;
  daysLeft: number;
  /** 期限までに達成するのに必要な1日あたりの純増 */
  perDay: number | null;
}

export interface WeeklyLikesKpi {
  likes: number | null;
  posts: number | null;
  target: number;
  rate: number | null;
  /** 今週の開始（月曜0時JST） */
  weekStart: string;
  measuredAt: string | null;
}

export interface UpdateStatusKpi {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  error: { at: string; message: string } | null;
  /** 最終取得から STALE_AFTER_HOURS 以上たっている（または一度も取得していない） */
  stale: boolean;
}

export interface Kpis {
  current: CurrentFollowers | null;
  month: MonthlyNet;
  milestones: MilestoneKpi[];
  weeklyLikes: WeeklyLikesKpi;
  status: UpdateStatusKpi;
}

const time = (iso: string) => Date.parse(iso);

function sortedSnapshots(data: KpiData): Snapshot[] {
  return [...data.snapshots].sort((a, b) => time(a.at) - time(b.at));
}

function computeCurrent(snaps: Snapshot[]): CurrentFollowers | null {
  const latest = snaps.at(-1);
  if (!latest) return null;
  const prev = snaps.at(-2) ?? null;
  return {
    followers: latest.followers,
    at: latest.at,
    previous: prev ? { followers: prev.followers, at: prev.at } : null,
    delta: prev ? latest.followers - prev.followers : null,
  };
}

function computeMonth(snaps: Snapshot[], now: Date): MonthlyNet {
  const target = GOALS.monthlyNet;
  const monthStart = monthStartJst(now).getTime();
  const latest = snaps.at(-1);
  if (!latest || time(latest.at) < monthStart) {
    return { net: null, target, rate: null, baseline: null };
  }

  // 月初直前（1日以内）の記録があれば、それを月初の値として使う
  const before = snaps.filter((s) => time(s.at) < monthStart).at(-1);
  let baseline: MonthlyNet['baseline'];
  if (before && monthStart - time(before.at) <= DAY_MS) {
    baseline = { followers: before.followers, at: before.at, exact: true };
  } else {
    const first = snaps.find((s) => time(s.at) >= monthStart)!;
    baseline = { followers: first.followers, at: first.at, exact: false };
  }

  const net = latest.followers - baseline.followers;
  return { net, target, rate: net / target, baseline };
}

function computeMilestones(current: CurrentFollowers | null, now: Date): MilestoneKpi[] {
  return GOALS.milestones.map((m) => {
    const daysLeft = daysLeftUntil(now, m.deadline);
    if (!current) {
      return { ...m, rate: null, remaining: null, daysLeft, perDay: null };
    }
    const remaining = Math.max(0, m.target - current.followers);
    return {
      ...m,
      rate: current.followers / m.target,
      remaining,
      daysLeft,
      perDay: remaining > 0 && daysLeft > 0 ? remaining / daysLeft : null,
    };
  });
}

function computeWeeklyLikes(snaps: Snapshot[], now: Date): WeeklyLikesKpi {
  const target = GOALS.weeklyLikes;
  const weekStart = weekStartJst(now);
  // 今週分として集計された、いいね取得に成功している最新の記録を使う
  const hit = [...snaps]
    .reverse()
    .find((s) => s.weeklyLikes !== null && time(s.weekStart) === weekStart.getTime());
  return {
    likes: hit?.weeklyLikes ?? null,
    posts: hit?.weeklyPosts ?? null,
    target,
    rate: hit?.weeklyLikes != null ? hit.weeklyLikes / target : null,
    weekStart: weekStart.toISOString(),
    measuredAt: hit?.at ?? null,
  };
}

function computeStatus(data: KpiData, now: Date): UpdateStatusKpi {
  const { lastSuccessAt, lastAttemptAt, error } = data.status;
  const stale =
    lastSuccessAt === null ||
    now.getTime() - time(lastSuccessAt) > STALE_AFTER_HOURS * 60 * 60 * 1000;
  return { lastSuccessAt, lastAttemptAt, error, stale };
}

export function computeKpis(data: KpiData, now: Date = new Date()): Kpis {
  const snaps = sortedSnapshots(data);
  const current = computeCurrent(snaps);
  return {
    current,
    month: computeMonth(snaps, now),
    milestones: computeMilestones(current, now),
    weeklyLikes: computeWeeklyLikes(snaps, now),
    status: computeStatus(data, now),
  };
}
