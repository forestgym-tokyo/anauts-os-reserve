# The Forest Gym 見学予約：2026年11月版の反映

## 変更内容

- 提供ロゴを使用。ヘッダーは黒背景でThe・Gym・Fitnessを白、葉・Forest・24hは緑。ロゴ下の店舗名は表示しない。開始時刻のみ表示、1〜2名の必須入力。
- TOURのみ60分・30分間隔・9:00〜20:00開始。サービス一覧と計算処理は旧 `booking_min_hours=1.5` を使用せず1時間を基本値とする。
- スタッフシフトと受付時間が1時間全体をカバーする最初の候補を、予約・カレンダー・締切で絞る**前**に固定。最初は開始2時間前、以降は1時間前のちょうどの時刻から受付終了。
- 日別・週次・キャッシュ再表示・旧UIに `booking_deadline_at` を返し、同じ締切で判定。確定処理のロック取得後とCalendar書き込み直前にも再検査。
- 見学者全員へ既存テンプレートで個別送信（宛先は大小文字を無視して重複排除）。片方の失敗後も他の見学者と管理者への送信を試行する。
- 2人目の氏名・電話・メールは既存 `reservations.note` に、人が読める形式と構造化データで保存。新規シート・列は不要。管理画面の備考と管理通知から確認可能。
- 送信エラーは既存 `mail_logs` に記録。予約は維持。リクエストIDの再送と、同じ日時・全員の情報で再読み込み後に行う再送も二重登録しない。
- `?preview=1` は公開日前後とも確定禁止。プレビュー付きAPIリクエストも拒否。
- `/tour/` は2026-11-01 00:00 JSTに新UIへ切替。URLパラメーターとフラグメントを維持。

## アンケートの印刷

- TOURは氏名・メールアドレス・電話番号のみ差し込む。郵便番号・住所・予約日時の差込セルは必ず空欄にする。既存住所が記録されていても印刷しない。
- 2名の予約では、管理画面のアンケート画面で「印刷する見学者」の①・②を選択。それぞれの表面・裏面（A4両面・長辺とじ、2ページ）を個別に作成する。
- ファイル名とリクエストキャッシュに見学者番号を含め、①と②を取り違えない。生成後も切替可能で、作成済みの各PDFを再表示できる。
- 見学者2は保存済みの構造化情報と、旧形式の「見学者2 氏名／電話番号／メールアドレス」備考に対応。情報のない②を指定した場合はPDFを作らずエラーにする。
- 旧クライアントからTOURをFULL・ADDRESS_ONLYで要求されても、住所は印刷しない。COUNSEL非会員の既存FULL・ADDRESS_ONLY・BLANKは変更しない。
- 本番では `46_TourQuestionnairePrint.js` と `46_1_TourQuestionnairePrintFast.js` の両方の差分を反映する。追加helperは共通46に置き、高速版も利用する。
- 管理フロントは `admin/admin-questionnaire.js` と読み込みバージョンを更新。通常のPages公開より先にGASを反映する。

## 必要な接続と権限

- Gitの読み取り・修正ブランチへのpush、GitHub API、本番GASのgetServicesへの接続を確認済み。通信先追加の適用により、当初のプロキシ403は解消。
- 環境ネットワーク設定に `api.github.com`、`forestgym-tokyo.github.io`、`script.google.com`、`script.googleusercontent.com`、`script.googleapis.com`、`oauth2.googleapis.com` を追加する。既存の許可先は保持する。
- GitHubのリポジトリ書き込み権限は確認済み。Google再認証後、GASソース取得と既存TOURデプロイの一致確認に成功。GASの実行APIは未設定のため、設定移行は既存Webアプリの初回サービス確認で行う。
- 同じGASプロジェクトへ編集・デプロイできるGoogleアカウントでclaspの再認証を行い、生成されたログイン設定をGitHub Actions Secret `CLASPRC_JSON` に安全に更新する。`CLASP_JSON` のプロジェクトIDは維持する。認証情報をチャットやリポジトリに記載しない。
- 再認証のコマンドは `npx --yes @google/clasp@3.4.1 login`。GASを更新する既存Googleアカウントでログインし、生成された `~/.clasprc.json` を https://github.com/forestgym-tokyo/anauts-os-reserve/settings/secrets/actions の `CLASPRC_JSON` に登録する（値はチャットへ送らない）。
- 再認証後は `.github/workflows/gas-source-readonly-audit.yml` を修正ブランチから実行し、接続を再確認してから本番差分反映へ進む。失敗診断: https://github.com/forestgym-tokyo/anauts-os-reserve/actions/runs/41164905466

## 反映ワークフロー

`.github/workflows/tfg-tour-release.yml` は手動実行専用。レビュー済みの `release_ref`（コミットSHA）と `phase=preflight` で事前確認し、成功後に同じコミットSHAを `phase=deploy` で反映する。ワークフローのmainへの登録はPRによるレビュー・承認を経て行う。

- 事前確認では本番を変更しない。認証情報は一時ファイルとして使用し、値をログへ出さない。
- 既存デプロイIDと公開版を照合し、ライブ専用ファイルとマニフェストを保持する。
- GAS全体の構文と対象外ファイルの変更・削除がないことを確認する。
- 書き込み直前にライブコードと公開版が変わっていないか再照合する。
- Google側に変更前の不変バージョンを保存してから、既存URLのままデプロイする。
- 初回getServicesでTOURの3設定を移行し、60分・30分間隔・基本1時間を検証。公開検証失敗時は元の公開版へ戻す。
- GAS確認後にのみPRをmainへ反映し、Pagesの公開を確認する。

## 反映順序（GAS → 設定 → 読み取り検証 → Pages）

新フロントはバックエンドの `booking_deadline_at` がない枠を選択不可にするため、**フロントだけを先にmainへ反映しない**。

### 1. 稼働中GASを保存して差分だけ反映

GitHubリポジトリ全体の `gas/` をそのままclasp pushしない。既存のシフト、9ROUND、MPG等のライブ専用変更を保持する。

既存のGASログインとプロジェクト設定を利用できる端末で、リポジトリ外の一時ディレクトリを作る。`.clasp.json` には既存の正しいscriptIdを設定し、rootDirを `.gas-live` にする（ユーザーの既存設定を上書きしない）。

```bash
# 一時ディレクトリ内で既存プロジェクトの接続設定を用意した後
npx --yes @google/clasp@3.4.1 pull
# .gas-live全体と .clasp.json を権限制限したリポジトリ外のバックアップへ保存
node /workspace/anauts-os-reserve/scripts/gas-tfg-tour-overlay.mjs "$PWD/.gas-live"
npx --yes @google/clasp@3.4.1 show-file-status
npx --yes @google/clasp@3.4.1 list-deployments
```

overlayは変更予定の全ファイルを検査してから書き込む。ライブコードと基準コミットの該当箇所が一致しない場合は停止する。自動でライブ版を上書きせず、差分を調査して取り込むこと。全てのライブ専用ファイルと変更箇所外の編集を保持し、再実行も可能。`60_StoreAwareAssignment.js` を使用し、同名の `.gs` を重複追加しない。

照合済みなら以下で既存デプロイを更新する。

```bash
npx --yes @google/clasp@3.4.1 push --force
npx --yes @google/clasp@3.4.1 update-deployment \
  AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0 \
  -d 'TFG tour: first-slot deadline and two-visitor confirmation'
```

このDeployment IDがlist-deploymentsと既存予約フロントのURLに一致することを必ず照合。新規デプロイを作ってURLを変更しない。上記のコマンド列はこのクラウドから実デプロイした記録ではない。

### 2. servicesシートの旧1.5時間設定を更新

新しい `getServices` の初回確認時に、旧設定が残っている場合だけ `configureTfgTourBookingRules_` を実行する。追加のGoogleログインや手作業の設定変更は不要。必要な場合は既存Apps Scriptエディターから同じ移行関数を実行できる。

- TOUR行の `booking_min_hours=1`、`duration=60`、`slot_interval_minutes=30` の3セルだけを更新。
- シートの再作成・予約削除・他サービス更新はしない。
- 設定列とTOUR行の一意性を検査し、ロック内で実行。空き枠キャッシュ世代も更新。
- service_hours の既存TOUR受付9:00〜21:00はそのまま使用。
- 2時間前ルールは単一のserviceセルでは表せないため、上記の基本1時間設定にGASの最初候補判定を組み合わせる。

### 3. GASの読み取り確認

既存 `/exec` に `action=getServices` を指定し、TOURの60分・30分間隔・基本1時間を確認。
`action=getAvailableSlotsRange&service_code=TOUR&start_date=YYYY-MM-DD&days=7` で以下を確認。

- 日別の `first_slot_start_time` がシフトと受付設定から決まること。
- 各枠の `booking_deadline_at` が日本時間の最初2時間前、以降1時間前を示すこと。
- スタッフ不在・既存予約・Calendar予定の時間は予約不可。
- キャッシュ後も最初の候補が繰り上がらないこと。

### 4. GitHub Pagesへ反映

GAS確認後に変更ブランチをmainへマージ／反映し、既存Pagesの公開処理完了を確認。

- 既存URL: https://forestgym-tokyo.github.io/anauts-os-reserve/tour/
- 確認専用: https://forestgym-tokyo.github.io/anauts-os-reserve/tour/november.html?preview=1
- 本番画面: https://forestgym-tokyo.github.io/anauts-os-reserve/tour/november.html

### 5. 実メールを伴う確認

店舗が許可したテスト用日時と受信可能な2つのメールアドレスを使い、1名と2名をそれぞれ1回だけ登録。両者へのメール受信、店舗名・電話・日時、管理者の備考表示、mail_logs、Calendarと予約レコード各1件を照合。同一宛先ケースは送信1回を確認。実在顧客の情報をテストに使用しない。確認後は店舗の通常の取消手順でテスト予約を取り消す。

## ローカル検証

```bash
cd /workspace/anauts-os-reserve
export PATH="/workspace/.anauts-tools/node_modules/node/bin:$PATH"
node --test --test-reporter=tap tests/*.test.js
export ROUND9_PLAYWRIGHT_MODULE=/workspace/.anauts-tools/node_modules/playwright
export ROUND9_CHROMIUM_PATH=/usr/bin/chromium
node tests/tfg-tour.browser.cjs
node tests/tour-questionnaire-guests.browser.cjs
```

Nodeテストには実際のGAS予約・空き枠・メール関数を利用し、Googleのサービス部分だけを架空データに置換。これは実Google環境での受信確認ではない。ブラウザーテストも本番APIには送信しない。証跡画像は既定で `/tmp/tfg-tour-evidence/`。

追加テストは、締切の直前とちょうどの時刻、10:00始業、締切・予約・キャッシュ後の候補固定、書き込み直前に締切を越すケース、1〜2名必須情報、宛先重複、メール失敗と再送、スタッフ不在・他店舗・短時間勤務、シートとCalendarの競合、20:00〜21:00、プレビュー、320/390/768/1280px表示、0時切替、ライブ差分反映の冪等性と競合停止を含む。既存MPG・9ROUND・パーソナルのテストも全件実行する。

アンケート追加後の検証結果: Node全253件が成功。印刷ブラウザーテストは320／390／1280pxで成功し、①②それぞれの作成、住所空欄、キャッシュの取り違え防止、1名・旧形式2名・COUNSEL互換性を確認。証跡画像: `/tmp/tfg-questionnaire-evidence/`。実際のGoogle PDF出力と本番印刷は認証失効のため未検証。
