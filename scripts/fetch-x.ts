// GitHub Actions から定期実行し、X のフォロワー数と今週のいいね数を履歴ファイルに追記する。
//
//   npm run fetch -- store/kpi.json
//
// 環境変数:
//   X_BEARER_TOKEN  X API の Bearer Token（必須）
//   X_USERNAME      計測するアカウント（省略時は src/config.ts の値）
//
// X API のエラーは履歴ファイルの status.error に記録し、画面の「更新状態」に表示する。
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { X_USERNAME } from '../src/config';
import { weekStartJst } from '../src/lib/time';
import { emptyData, type KpiData, type Snapshot } from '../src/lib/types';
import { fetchLikesSince, fetchUser } from './x-api';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadData(file: string, username: string): Promise<KpiData> {
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as KpiData;
    if (data.version === 1 && Array.isArray(data.snapshots)) return data;
    throw new Error('形式が不正です');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyData(username);
    // 壊れた履歴を上書きして消さないよう、ここで止める
    throw new Error(`${file} を読み込めません: ${errorText(e)}`);
  }
}

async function main() {
  const file = process.argv[2] ?? 'store/kpi.json';
  const token = process.env.X_BEARER_TOKEN?.trim();
  const username = (process.env.X_USERNAME?.trim() || X_USERNAME).replace(/^@/, '');
  const now = new Date();
  const nowIso = now.toISOString();

  const data = await loadData(file, username);
  data.username = username;
  data.status.lastAttemptAt = nowIso;

  const errors: string[] = [];
  if (!token) {
    errors.push('X_BEARER_TOKEN が設定されていません（GitHub の Secrets に登録してください）');
  } else {
    try {
      const user = await fetchUser(username, token);
      const weekStart = weekStartJst(now);
      const snapshot: Snapshot = {
        at: nowIso,
        followers: user.followers,
        weeklyLikes: null,
        weeklyPosts: null,
        weekStart: weekStart.toISOString(),
      };
      try {
        const weekly = await fetchLikesSince(user.id, weekStart, token);
        snapshot.weeklyLikes = weekly.likes;
        snapshot.weeklyPosts = weekly.posts;
      } catch (e) {
        errors.push(`いいねの取得に失敗: ${errorText(e)}`);
      }
      data.snapshots.push(snapshot);
      data.status.lastSuccessAt = nowIso;
      console.log(
        `@${username}: フォロワー ${user.followers} / 今週のいいね ${snapshot.weeklyLikes ?? '取得失敗'}（${snapshot.weeklyPosts ?? '-'}投稿）`,
      );
    } catch (e) {
      errors.push(`フォロワー数の取得に失敗: ${errorText(e)}`);
    }
  }

  const message = errors.join(' / ');
  data.status.error = message ? { at: nowIso, message } : null;

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');

  // 後続のステップで Actions を失敗扱いにして通知を飛ばすための出力
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `failed=${message ? 'true' : 'false'}\nmessage=${message.replace(/[\r\n]+/g, ' ')}\n`,
    );
  }
  if (message) console.error(`エラー: ${message}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
