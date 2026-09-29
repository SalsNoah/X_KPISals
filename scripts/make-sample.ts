// ローカル確認用のサンプルデータを public/data/kpi.json に作る（Git には含めない）。
//
//   npm run sample            通常のデータ
//   npm run sample -- error   X API エラーが起きた状態
//   npm run sample -- stale   しばらく取得できていない状態
//   npm run sample -- empty   まだ一度も取得できていない状態
import { mkdir, writeFile } from 'node:fs/promises';
import { X_USERNAME } from '../src/config';
import { weekStartJst } from '../src/lib/time';
import { emptyData, type KpiData, type Snapshot } from '../src/lib/types';

const mode = process.argv[2] ?? 'normal';
const HOUR = 60 * 60 * 1000;
const INTERVAL = 3 * HOUR;
const DAYS = 75;

// 再現性のある乱数
let seed = 20260929;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};

function build(): KpiData {
  const data = emptyData(X_USERNAME);
  if (mode === 'empty') {
    const now = new Date().toISOString();
    data.status = {
      lastAttemptAt: now,
      lastSuccessAt: null,
      error: { at: now, message: 'X_BEARER_TOKEN が設定されていません（GitHub の Secrets に登録してください）' },
    };
    return data;
  }

  const end = Date.now() - (mode === 'stale' ? 12 * HOUR : 20 * 60 * 1000);
  const start = end - DAYS * 24 * HOUR;
  let followers = 8_050;
  const snapshots: Snapshot[] = [];
  for (let t = start; t <= end; t += INTERVAL) {
    followers += Math.round(rand() * 7 - 2.2);
    const at = new Date(t);
    const weekStart = weekStartJst(at);
    const progress = (t - weekStart.getTime()) / (7 * 24 * HOUR);
    const weeklyLikes = Math.round(3_200 * progress ** 0.85 * (0.85 + rand() * 0.1));
    snapshots.push({
      at: at.toISOString(),
      followers,
      weeklyLikes,
      weeklyPosts: Math.max(0, Math.round(progress * 45)),
      weekStart: weekStart.toISOString(),
    });
  }
  data.snapshots = snapshots;
  const last = snapshots.at(-1)!.at;
  data.status = { lastAttemptAt: last, lastSuccessAt: last, error: null };

  if (mode === 'error') {
    const failedAt = new Date().toISOString();
    data.status.lastAttemptAt = failedAt;
    data.status.error = {
      at: failedAt,
      message: 'フォロワー数の取得に失敗: X API 429 レート制限に達しました: Too Many Requests',
    };
  }
  return data;
}

const out = new URL('../public/data/kpi.json', import.meta.url);
await mkdir(new URL('.', out), { recursive: true });
await writeFile(out, JSON.stringify(build(), null, 2) + '\n', 'utf8');
console.log(`public/data/kpi.json を作成しました（${mode}）`);
