/** GitHub Actions が X API から取得した1回分の記録 */
export interface Snapshot {
  /** 取得日時（ISO 8601, UTC） */
  at: string;
  followers: number;
  /** 今週（月曜0時JST〜）の投稿についた いいね の合計。取得失敗時は null */
  weeklyLikes: number | null;
  /** 集計対象になった今週の投稿数 */
  weeklyPosts: number | null;
  /** 集計した週の開始日時（ISO 8601, UTC） */
  weekStart: string;
}

export interface FetchStatus {
  /** 最後に取得を試みた日時 */
  lastAttemptAt: string | null;
  /** 最後にフォロワー数の取得に成功した日時 */
  lastSuccessAt: string | null;
  /** 直近の取得で起きたエラー。成功すれば null に戻る */
  error: { at: string; message: string } | null;
}

export interface KpiData {
  version: 1;
  username: string;
  /** 古い順 */
  snapshots: Snapshot[];
  status: FetchStatus;
}

export function emptyData(username: string): KpiData {
  return {
    version: 1,
    username,
    snapshots: [],
    status: { lastAttemptAt: null, lastSuccessAt: null, error: null },
  };
}
