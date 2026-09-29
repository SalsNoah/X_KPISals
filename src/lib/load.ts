import type { KpiData } from './types';

const DATA_URL: string = import.meta.env.VITE_DATA_URL ?? './data/kpi.json';
const CACHE_KEY = 'x-kpi:data:v1';

export class LoadError extends Error {}

function isKpiData(value: unknown): value is KpiData {
  const v = value as KpiData | null;
  return !!v && v.version === 1 && Array.isArray(v.snapshots) && typeof v.status === 'object';
}

/** GitHub Pages に置かれた履歴ファイルを取りに行く（キャッシュを避けるため毎回URLを変える） */
export async function fetchKpiData(): Promise<KpiData> {
  const url = new URL(DATA_URL, window.location.href);
  url.searchParams.set('t', String(Date.now()));

  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new LoadError(navigator.onLine ? 'サーバーに接続できません' : 'オフラインです');
  }
  if (res.status === 404) {
    throw new LoadError('データファイルがまだありません（GitHub Actions の初回実行待ち）');
  }
  if (!res.ok) throw new LoadError(`データを読み込めません（HTTP ${res.status}）`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new LoadError('データの形式が不正です');
  }
  if (!isKpiData(json)) throw new LoadError('データの形式が不正です');
  return json;
}

export interface CachedData {
  data: KpiData;
  savedAt: string;
}

export function readCache(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedData;
    return isKpiData(cached.data) ? cached : null;
  } catch {
    return null;
  }
}

export function writeCache(data: KpiData): void {
  try {
    const cached: CachedData = { data, savedAt: new Date().toISOString() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // プライベートブラウズなどで保存できなくても表示は続ける
  }
}
