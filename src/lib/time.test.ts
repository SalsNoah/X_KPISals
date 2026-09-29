import { describe, expect, it } from 'vitest';
import { daysLeftUntil, deadlineEndJst, monthStartJst, weekStartJst } from './time';

const iso = (d: Date) => d.toISOString();

describe('weekStartJst', () => {
  it('日本時間の月曜0時に揃える', () => {
    // 2026-09-29 11:30 JST（火）
    expect(iso(weekStartJst(new Date('2026-09-29T02:30:00Z')))).toBe('2026-09-27T15:00:00.000Z');
  });

  it('月曜0時ちょうどはその週の始まり', () => {
    expect(iso(weekStartJst(new Date('2026-09-27T15:00:00Z')))).toBe('2026-09-27T15:00:00.000Z');
  });

  it('日曜23:59（JST）は前の週', () => {
    // UTC ではまだ日曜の14:59
    expect(iso(weekStartJst(new Date('2026-09-27T14:59:00Z')))).toBe('2026-09-20T15:00:00.000Z');
  });
});

describe('monthStartJst', () => {
  it('UTC では前月でも、日本時間で月が変わっていれば当月1日', () => {
    // 2026-09-01 00:30 JST
    expect(iso(monthStartJst(new Date('2026-08-31T15:30:00Z')))).toBe('2026-08-31T15:00:00.000Z');
  });
});

describe('daysLeftUntil', () => {
  it('今日と期限日を含めて数える', () => {
    // 9/29〜12/31 = 2 + 31 + 30 + 31
    expect(daysLeftUntil(new Date('2026-09-29T02:30:00Z'), '2026-12-31')).toBe(94);
  });

  it('期限日当日は1日、過ぎたら0日', () => {
    expect(daysLeftUntil(new Date('2026-12-31T14:00:00Z'), '2026-12-31')).toBe(1);
    expect(daysLeftUntil(deadlineEndJst('2026-12-31'), '2026-12-31')).toBe(0);
  });
});
