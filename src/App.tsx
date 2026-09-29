import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X_USERNAME } from './config';
import { fmtDate, fmtDateTime, fmtInt, fmtPercent, fmtRelative, fmtSigned } from './lib/format';
import { computeKpis, type Kpis, type MilestoneKpi } from './lib/kpi';
import { fetchKpiData, LoadError, readCache, writeCache } from './lib/load';
import type { KpiData } from './lib/types';

interface LoadState {
  data: KpiData | null;
  /** 表示中の data をこの端末が読み込んだ日時（前回保存分を表示しているときはその保存日時） */
  loadedAt: string | null;
  loading: boolean;
  /** この端末でのデータ読み込みエラー */
  error: string | null;
}

/** 画面を開いたままのとき、この間隔で自動的に読み直す */
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function useKpiData() {
  const [state, setState] = useState<LoadState>(() => {
    const cached = readCache();
    return {
      data: cached?.data ?? null,
      loadedAt: cached?.savedAt ?? null,
      loading: true,
      error: null,
    };
  });
  const lastLoad = useRef(0);

  const reload = useCallback(async () => {
    lastLoad.current = Date.now();
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fetchKpiData();
      writeCache(data);
      setState({ data, loadedAt: new Date().toISOString(), loading: false, error: null });
    } catch (e) {
      const message = e instanceof LoadError ? e.message : `読み込みに失敗しました: ${String(e)}`;
      setState((s) => ({ ...s, loading: false, error: message }));
    }
  }, []);

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 60_000) void reload();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [reload]);

  return { ...state, reload };
}

/** 「〇分前」の表示を進めるための現在時刻 */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export default function App() {
  const { data, loadedAt, loading, error, reload } = useKpiData();
  const now = useNow();
  const kpis = useMemo(() => (data ? computeKpis(data, now) : null), [data, now]);
  const username = data?.username ?? X_USERNAME;

  const hasProblem = !!error || !!kpis?.status.error || !!kpis?.status.stale;

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="header-sub">X KPI</p>
          <h1 className="header-title">@{username}</h1>
        </div>
        <button
          type="button"
          className="refresh"
          onClick={() => void reload()}
          disabled={loading}
          aria-label="最新のデータを読み込む"
        >
          <span className={loading ? 'refresh-icon spinning' : 'refresh-icon'} aria-hidden="true">
            ↻
          </span>
          {loading ? '読み込み中' : '更新'}
        </button>
      </header>

      {kpis && hasProblem && (
        <a className="alert" href="#status">
          {error || kpis.status.error
            ? '通信エラーがあります'
            : kpis.status.lastSuccessAt
              ? 'データがしばらく更新されていません'
              : 'まだデータを取得していません'}
          <span aria-hidden="true">→ 更新状態</span>
        </a>
      )}

      {!kpis ? (
        <EmptyState loading={loading} error={error} onRetry={() => void reload()} />
      ) : (
        <main className="grid">
          <FollowersCard kpis={kpis} />
          <MonthlyCard kpis={kpis} />
          {kpis.milestones.map((m) => (
            <MilestoneCard key={m.id} milestone={m} />
          ))}
          <WeeklyLikesCard kpis={kpis} />
          <StatusCard kpis={kpis} now={now} loadError={error} loadedAt={loadedAt} />
        </main>
      )}
    </div>
  );
}

function Card({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card" id={id} aria-label={title}>
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
        {aside && <span className="card-aside">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Progress({ rate, label }: { rate: number | null; label: string }) {
  const pct = rate === null ? 0 : Math.min(100, Math.max(0, rate * 100));
  return (
    <div
      className={rate !== null && rate >= 1 ? 'progress done' : 'progress'}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Big({ value, unit, tone }: { value: string; unit: string; tone?: 'up' | 'down' }) {
  return (
    <p className={`big ${tone ?? ''}`}>
      {value}
      <span className="unit">{unit}</span>
    </p>
  );
}

function deltaTone(n: number | null): 'up' | 'down' | undefined {
  if (n === null || n === 0) return undefined;
  return n > 0 ? 'up' : 'down';
}

function FollowersCard({ kpis }: { kpis: Kpis }) {
  const c = kpis.current;
  return (
    <Card title="現在のフォロワー">
      <Big value={c ? fmtInt(c.followers) : '—'} unit="人" />
      <p className="sub">
        {c?.delta != null && c.previous ? (
          <>
            <span className={`chip ${deltaTone(c.delta) ?? ''}`}>{fmtSigned(c.delta)}</span>
            前回 {fmtDateTime(c.previous.at)} から
          </>
        ) : c ? (
          '前回の記録がまだありません'
        ) : (
          'まだ取得していません'
        )}
      </p>
    </Card>
  );
}

function MonthlyCard({ kpis }: { kpis: Kpis }) {
  const m = kpis.month;
  const left = m.net === null ? null : m.target - m.net;
  return (
    <Card title="今月の純増" aside={`目標 ${fmtInt(m.target)}人`}>
      <div className="row">
        <Big value={m.net === null ? '—' : fmtSigned(m.net)} unit="人" tone={deltaTone(m.net)} />
        {m.rate !== null && <p className="rate">{fmtPercent(m.rate)}</p>}
      </div>
      <Progress rate={m.rate} label="今月の純増の進捗" />
      <p className="sub split">
        <span>
          {m.baseline
            ? m.baseline.exact
              ? `月初 ${fmtInt(m.baseline.followers)}人`
              : `${fmtDate(m.baseline.at)}から計測（${fmtInt(m.baseline.followers)}人）`
            : '今月のデータがまだありません'}
        </span>
        {left !== null && <span>{left > 0 ? `あと ${fmtInt(left)}人` : '目標達成'}</span>}
      </p>
    </Card>
  );
}

function MilestoneCard({ milestone: m }: { milestone: MilestoneKpi }) {
  const deadline = new Date(`${m.deadline}T00:00:00+09:00`).toISOString();
  return (
    <Card title={m.label} aside={`期限 ${fmtDate(deadline)}`}>
      <div className="row">
        <Big value={m.rate === null ? '—' : fmtPercent(m.rate)} unit="達成" />
        <p className="rate muted">目標 {fmtInt(m.target)}人</p>
      </div>
      <Progress rate={m.rate} label={`${m.label}の達成率`} />
      <p className="sub split">
        <span>{m.remaining === null ? '—' : m.remaining > 0 ? `残り ${fmtInt(m.remaining)}人` : '達成済み'}</span>
        {m.perDay !== null && (
          <span>
            あと{m.daysLeft}日・1日 +{m.perDay.toFixed(1)}人
          </span>
        )}
        {m.remaining !== null && m.remaining > 0 && m.daysLeft === 0 && <span>期限切れ</span>}
      </p>
    </Card>
  );
}

function WeeklyLikesCard({ kpis }: { kpis: Kpis }) {
  const w = kpis.weeklyLikes;
  const left = w.likes === null ? null : w.target - w.likes;
  return (
    <Card title="週間いいね" aside={`目標 ${fmtInt(w.target)}件`}>
      <div className="row">
        <Big value={w.likes === null ? '—' : fmtInt(w.likes)} unit="件" />
        {w.rate !== null && <p className="rate">{fmtPercent(w.rate)}</p>}
      </div>
      <Progress rate={w.rate} label="週間いいねの進捗" />
      <p className="sub split">
        <span>
          {fmtDate(w.weekStart)}〜の投稿
          {w.posts !== null ? ` ${fmtInt(w.posts)}件` : ''}
        </span>
        <span>
          {left === null ? '今週のデータはまだありません' : left > 0 ? `あと ${fmtInt(left)}件` : '目標達成'}
        </span>
      </p>
    </Card>
  );
}

function StatusCard({
  kpis,
  now,
  loadError,
  loadedAt,
}: {
  kpis: Kpis;
  now: Date;
  loadError: string | null;
  loadedAt: string | null;
}) {
  const s = kpis.status;
  const noErrors = !s.error && !loadError;
  return (
    <Card title="更新状態" id="status">
      <dl className="status">
        <dt>最終取得</dt>
        <dd>
          {s.lastSuccessAt ? (
            <>
              {fmtDateTime(s.lastSuccessAt)}
              <span className="muted">（{fmtRelative(s.lastSuccessAt, now)}）</span>
              {s.stale && <span className="warn-text">しばらく更新されていません</span>}
            </>
          ) : (
            <span className="warn-text">まだ取得できていません</span>
          )}
        </dd>

        {s.lastAttemptAt && s.lastAttemptAt !== s.lastSuccessAt && (
          <>
            <dt>最終試行</dt>
            <dd>
              {fmtDateTime(s.lastAttemptAt)}
              <span className="muted">（{fmtRelative(s.lastAttemptAt, now)}）</span>
            </dd>
          </>
        )}

        <dt>通信エラー</dt>
        <dd>
          {noErrors ? (
            <span className="ok-text">なし</span>
          ) : (
            <ul className="errors">
              {s.error && (
                <li>
                  <strong>X API</strong>（{fmtDateTime(s.error.at)}）
                  <br />
                  {s.error.message}
                </li>
              )}
              {loadError && (
                <li>
                  <strong>この端末</strong>
                  <br />
                  {loadError}
                  {loadedAt && (
                    <span className="muted">（{fmtDateTime(loadedAt)} に読み込んだデータを表示中）</span>
                  )}
                </li>
              )}
            </ul>
          )}
        </dd>
      </dl>
    </Card>
  );
}

function EmptyState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  return (
    <main className="empty">
      {loading ? (
        <p>読み込み中…</p>
      ) : (
        <>
          <p className="empty-title">データを表示できません</p>
          <p className="warn-text">{error}</p>
          <button type="button" className="refresh" onClick={onRetry}>
            もう一度読み込む
          </button>
        </>
      )}
    </main>
  );
}
