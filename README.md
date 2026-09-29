# X KPI

X（@Sals_mj）のフォロワー数といいね数の目標進捗を、スマホで見るための画面です。

公開URL: https://salsnoah.github.io/X_KPISals/

| 表示 | 内容 |
|---|---|
| 現在のフォロワー | 最新人数・前回取得からの増減 |
| 今月の純増 | 月初との差／目標800人 |
| 年内1万人 | 達成率・残り人数（残り日数と1日あたりの必要ペースも表示） |
| 2027年末2万人 | 達成率・残り人数（同上） |
| 週間いいね | 目標3,000件に対する進捗 |
| 更新状態 | 最終取得日時・通信エラー |

## しくみ

1. GitHub Actions（`.github/workflows/update.yml`）が3時間ごとに X API からフォロワー数と今週の投稿のいいね数を取得する
2. 取得結果を `data` ブランチの `kpi.json` に追記する（取得に失敗したときはエラー内容を記録する）
3. 画面をビルドして `kpi.json` と一緒に GitHub Pages に公開する
4. スマホで開くと `kpi.json` を読み込んで KPI を計算して表示する。読み込めないときは前回読み込んだデータを表示し、「更新状態」にエラーを出す

日付の区切りはすべて日本時間です。

- **今月の純増**: 月初（1日0時）直前の記録との差。月初の記録が無い月は、その月の最初の記録との差
- **週間いいね**: 今週（月曜0時〜）に投稿したポスト（リポストを除く）についた いいね の合計
- **データが古い警告**: 最終取得から8時間を超えると表示

## はじめに設定すること

1. [X Developer Portal](https://developer.x.com/) でアプリを作り、**Bearer Token** を発行する
2. GitHub のこのリポジトリで Settings → Secrets and variables → Actions → **New repository secret** を開き、名前 `X_BEARER_TOKEN` でトークンを登録する
3. Actions タブ → **Update KPI** → **Run workflow** で初回の取得を実行する
4. スマホで公開URLを開き、ホーム画面に追加する（iPhone は Safari の共有 → 「ホーム画面に追加」）

## 変更したいとき

- **目標値・アカウント**: `src/config.ts`
- **取得の間隔**: `.github/workflows/update.yml` の `cron`（X API の利用料金は取得回数に応じて増えるので、プランに合わせて調整する）
- 別のアカウントを計測するときは、Actions の Variables に `X_USERNAME` を登録しても切り替えられる

## ローカルでの開発

```bash
npm install
npm run sample          # 確認用のサンプルデータを作る（error / stale / empty も指定可）
npm run dev             # http://localhost:5173
npm test
npm run build
```

実データを手元で取得する場合:

```bash
X_BEARER_TOKEN=... npm run fetch -- store/kpi.json
```

## 注意

- 公開リポジトリのため、取得したフォロワー数・いいね数の履歴（`data` ブランチ）も公開されます
- GitHub は、公開リポジトリで60日間動きが無いと定期実行を止めることがあります。止まったときは Actions タブから再開できます
