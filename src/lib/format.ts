import { jstParts } from './time';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('ja-JP');
}

/** +1,234 / -12 / ±0 */
export function fmtSigned(n: number): string {
  if (n === 0) return '±0';
  return (n > 0 ? '+' : '-') + fmtInt(Math.abs(n));
}

export function fmtPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 9/29(火) 11:03（日本時間） */
export function fmtDateTime(iso: string): string {
  const p = jstParts(new Date(iso));
  return `${p.month + 1}/${p.day}(${WEEKDAYS[p.weekday]}) ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** 9/29(火)（日本時間） */
export function fmtDate(iso: string): string {
  const p = jstParts(new Date(iso));
  return `${p.month + 1}/${p.day}(${WEEKDAYS[p.weekday]})`;
}

export function fmtRelative(iso: string, now: Date): string {
  const diffMin = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  return `${Math.floor(diffHour / 24)}日前`;
}
