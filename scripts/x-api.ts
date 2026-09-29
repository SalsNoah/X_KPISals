// X API v2 の最小限のクライアント（アプリ専用の Bearer Token を使う）
import { fmtDateTime } from '../src/lib/format';

const API_BASE = 'https://api.x.com/2';
/** 1週間分の投稿を読むときの最大ページ数（100件 × 10 = 1,000投稿） */
const MAX_TIMELINE_PAGES = 10;

export class XApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'XApiError';
    this.status = status;
  }
}

export interface RequestOptions {
  fetchFn?: typeof fetch;
  /** 5xx や通信失敗のときに再試行するまでの待ち時間 */
  retryDelayMs?: number;
}

interface ApiErrorBody {
  title?: string;
  detail?: string;
  errors?: { title?: string; detail?: string; message?: string }[];
}

const STATUS_HINTS: Record<number, string> = {
  400: 'リクエストが不正です',
  401: 'Bearer Token が無効です',
  402: 'X API のクレジットが不足しています',
  403: 'このAPIを使う権限がありません',
  404: '見つかりません',
  429: 'レート制限に達しました',
};

function detailOf(body: ApiErrorBody | null): string {
  if (!body) return '';
  const first = body.errors?.[0];
  return body.detail || first?.detail || first?.message || body.title || first?.title || '';
}

async function toApiError(res: Response): Promise<XApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // 本文が JSON でなければ詳細なしで扱う
  }
  let message = `X API ${res.status}`;
  const hint = STATUS_HINTS[res.status] ?? (res.status >= 500 ? 'X側のサーバーエラーです' : '');
  if (hint) message += ` ${hint}`;
  if (res.status === 429) {
    const reset = Number(res.headers.get('x-rate-limit-reset'));
    if (reset > 0) message += `（${fmtDateTime(new Date(reset * 1000).toISOString())} に解除）`;
  }
  const detail = detailOf(body);
  if (detail) message += `: ${detail}`;
  return new XApiError(message, res.status);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  { fetchFn = fetch, retryDelayMs = 3000 }: RequestOptions,
): Promise<T> {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let lastError: XApiError | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) await sleep(retryDelayMs);
    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      lastError = new XApiError(`X API に接続できません: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    lastError = await toApiError(res);
    if (res.status < 500) break;
  }
  throw lastError!;
}

/** X API の start_time はミリ秒なしの形式にしておく */
function toApiTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface XUser {
  id: string;
  username: string;
  followers: number;
}

export async function fetchUser(username: string, token: string, opts: RequestOptions = {}): Promise<XUser> {
  const body = await request<{
    data?: { id: string; username: string; public_metrics?: { followers_count?: number } };
  } & ApiErrorBody>(`/users/by/username/${encodeURIComponent(username)}`, { 'user.fields': 'public_metrics' }, token, opts);

  const followers = body.data?.public_metrics?.followers_count;
  if (!body.data || typeof followers !== 'number') {
    const detail = detailOf(body);
    throw new XApiError(`@${username} の情報を取得できません${detail ? `: ${detail}` : ''}`);
  }
  return { id: body.data.id, username: body.data.username, followers };
}

export interface WeeklyLikes {
  likes: number;
  posts: number;
}

/** since 以降の自分の投稿（リポストを除く）についた いいね を合計する */
export async function fetchLikesSince(
  userId: string,
  since: Date,
  token: string,
  opts: RequestOptions = {},
): Promise<WeeklyLikes> {
  let likes = 0;
  let posts = 0;
  let nextToken: string | undefined;

  for (let page = 0; page < MAX_TIMELINE_PAGES; page++) {
    const params: Record<string, string> = {
      max_results: '100',
      start_time: toApiTime(since),
      exclude: 'retweets',
      'tweet.fields': 'public_metrics,created_at',
    };
    if (nextToken) params.pagination_token = nextToken;

    const body = await request<{
      data?: { id: string; public_metrics?: { like_count?: number } }[];
      meta?: { next_token?: string };
    }>(`/users/${encodeURIComponent(userId)}/tweets`, params, token, opts);

    for (const post of body.data ?? []) {
      likes += post.public_metrics?.like_count ?? 0;
      posts += 1;
    }
    nextToken = body.meta?.next_token;
    if (!nextToken) break;
  }
  return { likes, posts };
}
