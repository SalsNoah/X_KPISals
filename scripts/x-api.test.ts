import { describe, expect, it } from 'vitest';
import { fetchLikesSince, fetchUser } from './x-api';

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** 呼ばれた URL を記録しつつ、用意したレスポンスを順に返す fetch */
function mockFetch(responses: (Response | Error)[]) {
  const calls: URL[] = [];
  const fetchFn = (async (input: URL | RequestInfo) => {
    calls.push(new URL(String(input)));
    const next = responses.shift();
    if (!next) throw new Error('想定外の呼び出し');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchFn, calls, opts: { fetchFn, retryDelayMs: 0 } };
}

describe('fetchUser', () => {
  it('フォロワー数を返す', async () => {
    const m = mockFetch([json({ data: { id: '42', username: 'Sals_mj', public_metrics: { followers_count: 8_912 } } })]);
    await expect(fetchUser('Sals_mj', 'token', m.opts)).resolves.toEqual({ id: '42', username: 'Sals_mj', followers: 8_912 });
    expect(m.calls[0].pathname).toBe('/2/users/by/username/Sals_mj');
    expect(m.calls[0].searchParams.get('user.fields')).toBe('public_metrics');
  });

  it('200 でもユーザーが無ければエラー', async () => {
    const m = mockFetch([json({ errors: [{ title: 'Not Found Error', detail: 'Could not find user with username: [nobody].' }] })]);
    await expect(fetchUser('nobody', 'token', m.opts)).rejects.toThrow('@nobody の情報を取得できません: Could not find user');
  });

  it('401 はトークン無効として日本語で説明する', async () => {
    const m = mockFetch([json({ title: 'Unauthorized', detail: 'Unauthorized', status: 401 }, 401)]);
    await expect(fetchUser('Sals_mj', 'bad', m.opts)).rejects.toThrow('X API 401 Bearer Token が無効です: Unauthorized');
    expect(m.calls).toHaveLength(1);
  });

  it('429 は解除時刻を添える', async () => {
    // 2026-09-29 12:15 JST
    const reset = String(Date.parse('2026-09-29T03:15:00Z') / 1000);
    const m = mockFetch([json({ title: 'Too Many Requests' }, 429, { 'x-rate-limit-reset': reset })]);
    await expect(fetchUser('Sals_mj', 'token', m.opts)).rejects.toThrow('X API 429 レート制限に達しました（9/29(火) 12:15 に解除）');
  });

  it('5xx や通信失敗は1回だけ再試行する', async () => {
    const ok = json({ data: { id: '42', username: 'Sals_mj', public_metrics: { followers_count: 1 } } });
    await expect(fetchUser('Sals_mj', 'token', mockFetch([json({}, 503), ok]).opts)).resolves.toMatchObject({ followers: 1 });

    const m = mockFetch([new TypeError('fetch failed'), new TypeError('fetch failed')]);
    await expect(fetchUser('Sals_mj', 'token', m.opts)).rejects.toThrow('X API に接続できません: fetch failed');
    expect(m.calls).toHaveLength(2);
  });
});

describe('fetchLikesSince', () => {
  it('ページをたどって いいね を合計する', async () => {
    const m = mockFetch([
      json({
        data: [
          { id: '1', public_metrics: { like_count: 100 } },
          { id: '2', public_metrics: { like_count: 50 } },
        ],
        meta: { next_token: 'NEXT' },
      }),
      json({ data: [{ id: '3', public_metrics: { like_count: 7 } }], meta: {} }),
    ]);
    const since = new Date('2026-09-27T15:00:00.000Z');
    await expect(fetchLikesSince('42', since, 'token', m.opts)).resolves.toEqual({ likes: 157, posts: 3 });

    const first = m.calls[0];
    expect(first.pathname).toBe('/2/users/42/tweets');
    expect(first.searchParams.get('start_time')).toBe('2026-09-27T15:00:00Z');
    expect(first.searchParams.get('exclude')).toBe('retweets');
    expect(first.searchParams.get('max_results')).toBe('100');
    expect(first.searchParams.has('pagination_token')).toBe(false);
    expect(m.calls[1].searchParams.get('pagination_token')).toBe('NEXT');
  });

  it('今週まだ投稿が無ければ 0', async () => {
    const m = mockFetch([json({ meta: { result_count: 0 } })]);
    await expect(fetchLikesSince('42', new Date(), 'token', m.opts)).resolves.toEqual({ likes: 0, posts: 0 });
  });
});
