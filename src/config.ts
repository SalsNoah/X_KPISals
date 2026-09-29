// KPIの目標値。数字を変えたいときはここだけ編集する。

/** 計測するXアカウント（GitHub の変数 X_USERNAME があればそちらが優先） */
export const X_USERNAME = 'Sals_mj';

export const GOALS = {
  /** 今月の純増の目標（人） */
  monthlyNet: 800,
  /** 長期のフォロワー目標。deadline はその日の終わり（日本時間）まで */
  milestones: [
    { id: 'year-2026', label: '年内1万人', target: 10_000, deadline: '2026-12-31' },
    { id: 'end-2027', label: '2027年末2万人', target: 20_000, deadline: '2027-12-31' },
  ],
  /** 週間いいねの目標（件）。週は月曜0時（日本時間）はじまり */
  weeklyLikes: 3_000,
} as const;

/** 最終取得からこの時間を超えたら「データが古い」と警告する */
export const STALE_AFTER_HOURS = 8;
