# TFG WEB入会 — A-nauts OS 会員番号発行一本化（移行計画）

## 対象・現状

- WEB入会フォーム（通常）: `forestgym-tokyo/membership-form/index.html`
- WEB入会フォーム（LINE）: `forestgym-tokyo/membership-form/line.html`
- 見学当日入会: `gas/70_TourSameDayEnrollment.gs` の `createTourSameDayEnrollment()`
- WEB申込み記録: `TFG_Membership_Form / membership_form`
- 会員番号原簿: `TFG_Master / master`
- WEB入会の旧GAS: `AKfycbynTLgYkJCjz2cyE9wgNhRF5yyBlccfsGt-3lFm6sHgrrSiASeZeEzoZzSzkYA3u8mzoA`（編集元未特定）
- A-nauts OS の既存Webアプリ: `AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0`

**変更をGitHubへ保存しただけでは、稼働中のApps Scriptは更新されない。**

## 新しい受付フロー

1. どちらのWEBフォームでも `applicationId`（ブラウザー単位の再送信で保持）を発行する。
2. A-nauts OS の既存 `doPost` に `action=submitTfgWebMembership` を送信する。
3. `TFG_WEB_JOIN_ENABLED` が `true` の場合だけ処理する。
4. 見学当日入会と**同じスクリプトの `LockService.getScriptLock()`** の中で会員原簿を検査する。
5. 同一 `applicationId` は `membership_form!T` と `master!G` の `WEB_JOIN_ID=` で照合し、再発行しない。
6. 同一メール・氏名でSTATUS=`ACT` は二重登録拒否。メールだけ同じACT会員がいる場合、既存の`dupOk`がない限り保留。
7. STATUSが空欄で氏名がある行は**退会済みの履歴**とし、別の空き番号を割り当てる。過去の番号は再利用しない。
8. 空き行はA列に番号がありB列（氏名）・STATUSが空欄の行のみを使用する。
9. `membership_form!S:AB` に会員番号・申込みID・登録状態・広告識別子を保存する。従来のA:Rは維持。
10. GET `action=tfgWebJoinStatus` に対する短命なJSONP応答（PIIを含まない）を確認してから、フォームが月額パンダの決済入力へ移動する。

なお、入力時点の `ACT` は**決済済みの証拠ではない**。WEB入会CVは決済完了の証跡が得られるまで計上しない。

## デプロイ前のブロッカー（重要）

- **Apps Script編集元への更新権限**：Google Drive接続ではApps Scriptソースを更新できない。
- **claspソース同期**：`gas/CLASP_SYNC.md` に記載のとおり、現在GitHubには遠隔GASだけに存在する `89*9RoundInterview*.gs` が欠けている。**`clasp push` を先行実施しないこと**（遠隔ファイルの消失リスク）。
- **旧GAS停止**：旧 `/exec` が会員番号を発行し続けると、異なるGAS間のScriptLockは共有されない。WEB経路をすべて切り替えたうえで旧WEB受付の停止・転送を計画する。
- **通知の保全**：新処理は管理者メールを送信する。LINE通知には新しいA-nauts OSプロジェクトの Script Properties に `TFG_WEB_JOIN_LINE_CHANNEL_ACCESS_TOKEN` と `TFG_WEB_JOIN_LINE_USER_ID` を設定する必要がある。**秘密情報はGitHubへ保存しない**。
- **匿名APIの保護**：新WEB受付は公開APIになる。乱用対策（Turnstile等）を含め、本番公開前にアクセス制御・利用上限を確認する。
- **価格・決済**：決済先はプラン別6 URLを許可リストに限定しているが、初回金額は現状フロント計算値。決済確定と照合しないままCVや料金確定の根拠に使わない。

## 安全な導入順序

1. GitHubの2つのドラフトPRを確認し、`node --test tests/tfg-web-membership.test.cjs` で模擬テストする。
2. GAS Pull (safe) で遠隔にのみあるファイルを含む完全なソースを取得・照合する。照合できるまでGAS Push禁止。
3. A-nauts OSへのソース反映後、**既存WEBアプリのデプロイを新バージョンに更新**する。新しいデプロイURLを作らず同じURLを維持する。`TFG_WEB_JOIN_ENABLED` は未設定（=off）のまま。
4. `?action=health` が既存どおり正常であること、`?action=tfgWebJoinStatus&applicationId=11111111-1111-4111-8111-111111111111&callback=tfgJoinCb_12345678` が副作用なく `pending` を返すことを確認する。
5. 検証用の原簿と申込記録を使い、再送信・在籍中重複・退会済み再入会・書込み途中障害を通しで検証する（本番会員番号をテストで消費しない）。
6. 担当者が通知先・匿名API乱用対策・旧GAS停止手順を確認した後、A-nauts OSのScript Propertiesで `TFG_WEB_JOIN_ENABLED=true` に設定する。
7. フォームの `index.html` と `line.html` の変更を**同一リリース**として公開する。両方とも新A-nauts OSに送信されることを確認。
8. 本番移行直後は `TFG_Master` の会員番号、`membership_form!S:AB`、管理メール・LINE、決済遷移を監視し、従来GASへのリクエストがないことを確認後に旧受付を停止する。
9. 障害があればフォーム切戻し前に、旧GASとの同時番号発行を避けるため新旧の受付経路をどちらか一方に限定し、照合できない申込みは手動保留する。

## Google広告CV連携（別工程）

- フォームで `gclid/gbraid/wbraid/utm_*` を記録する。
- 月額パンダの「お申し込みがありました」は**決済完了ではない**。
- 実際の決済完了通知、初月請求項目、申込者、申込時刻、および可能なら決済取引IDの照合後のみGoogle AdsへCV出力する。
- 同姓同名・月次継続決済・未確定決済は自動照合せず、`web_join_reconciliation` で確認待ちとする。

## 設定・対象コード

- GETルーター `gas/99_Main.gs` : `tfgWebJoinStatus`
- POSTルーター `gas/99_Main.gs` : `submitTfgWebMembership`
- WEB受付 `gas/94_TfgWebMembershipEnrollment.gs`
- テスト `tests/tfg-web-membership.test.cjs`
- 対応WEBフォームPR `https://github.com/forestgym-tokyo/membership-form/pull/6`

**PRをマージしただけではGASへデプロイされない。** 未確認の編集元GASを推測して既存ソースを全置換しないこと。
