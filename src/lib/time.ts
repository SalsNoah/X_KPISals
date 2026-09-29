// 日本時間（UTC+9、サマータイムなし）で日付計算をするためのヘルパー。
// 端末のタイムゾーンに関係なく同じ結果になるよう、固定オフセットで計算する。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface JstParts {
  year: number;
  /** 0 = 1月 */
  month: number;
  day: number;
  /** 0 = 日曜 */
  weekday: number;
  hour: number;
  minute: number;
}

export function jstParts(date: Date): JstParts {
  const j = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: j.getUTCFullYear(),
    month: j.getUTCMonth(),
    day: j.getUTCDate(),
    weekday: j.getUTCDay(),
    hour: j.getUTCHours(),
    minute: j.getUTCMinutes(),
  };
}

/** 日本時間の年月日時分から Date を作る */
export function fromJst(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - JST_OFFSET_MS);
}

/** その月の1日 0:00（日本時間） */
export function monthStartJst(date: Date): Date {
  const p = jstParts(date);
  return fromJst(p.year, p.month, 1);
}

/** その週の月曜 0:00（日本時間） */
export function weekStartJst(date: Date): Date {
  const p = jstParts(date);
  const daysSinceMonday = (p.weekday + 6) % 7;
  return fromJst(p.year, p.month, p.day - daysSinceMonday);
}

/** 'YYYY-MM-DD' の翌日 0:00（日本時間）。その日いっぱいを期限とするための境界 */
export function deadlineEndJst(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return fromJst(y, m - 1, d + 1);
}

/** 期限までの残り日数（今日を含む）。期限を過ぎていれば 0 */
export function daysLeftUntil(now: Date, ymd: string): number {
  const end = deadlineEndJst(ymd).getTime();
  if (now.getTime() >= end) return 0;
  const p = jstParts(now);
  const todayStart = fromJst(p.year, p.month, p.day).getTime();
  return Math.round((end - todayStart) / DAY_MS);
}
