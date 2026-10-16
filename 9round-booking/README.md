# 9ROUND アリオ蘇我店 ワークアウト予約

開発ブランチ：feature/9round-member-booking

**本番未反映です。** config.jsのAPI URLは空で、静的ページは本番APIに接続しません。別プロジェクト「9ROUND Booking DEV - isolated」にコードと画面を保存しました。既存A-nauts GAS・既存デプロイ・シート・トリガーは変更しません。

## 構成

| 用途 | ソース | 動作 |
| --- | --- | --- |
| 会員予約 | 9round-booking/index.html | 登録メールの確認コード → 日付 → 枠のタップで予約 |
| 独立管理画面 | 9round-booking/staff/index.html | スタッフログイン、氏名確認。ADMIN/MANAGERはブロック・体験枠管理 |
| 独立GAS | 9round-booking/gas/ | 新規の別Apps Scriptプロジェクト専用 |
| 予約データ | 別の新規スプレッドシート | nr_challenges、nr_sessions、nr_bookings、nr_trials、nr_blocks |
| 会員情報 | 9ROUND会員マスター | 読み取りのみ。番号・名前・メール・会員ステータスを照合 |
| スタッフ認証 | 既存Firebase＋スタッフ名簿 | Firebaseでトークンを検証。auth_users・staffは読み取りのみ |
| A-nauts連携 | admin/admin-9round-booking.js | 「予定一覧／9ROUND予定」に閲覧専用パネル。人数・氏名・受付停止状態のみ |

会員予約はA-nauts GAS・スタッフ名簿に依存しません。A-nauts側の変更は追加スクリプトの読み込みだけで、既存GASルーター・シフト・入会・退会処理は変更しません。連携スクリプトに予約・ブロック・体験枠更新APIの呼び出しはありません。

## 費用の条件

追加の有料サービス・課金契約は使用しません。公開リポジトリのGitHub Pages、GAS、Googleスプレッドシート、既存Firebaseのメール／パスワード認証を使います。Cloud Functions・Firestore・SMS認証・外部予約サービス・外部メール配信サービスを追加しません。無料上限に達した場合も、有料APIへの切替えや自動プラン変更を行いません。

メール確認コードはFirebaseのメールリンク認証を使わず、GASのMailAppで送ります。GASの送信上限は実行アカウントごとに適用され、個人Googleアカウントでは通常1日100宛先です。上限到達時は送信が失敗し、予約用コードは無効化します。既存Google／Firebaseアカウントの契約・課金設定は変更しません。

公式資料：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages)、[Apps Scriptの割当量](https://developers.google.com/apps-script/guides/services/quotas)、[Firebase料金プラン](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)。

## デイリーワークアウト

全枠45分、各4名です。14:00〜16:15に枠はありません。

| 午前 | 午後 |
| --- | --- |
| 10:15〜11:00 | 16:15〜17:00 |
| 11:00〜11:45 | 17:00〜17:45 |
| 11:45〜12:30 | 17:45〜18:30 |
| 12:30〜13:15 | 18:30〜19:15 |
| 13:15〜14:00 | 19:15〜20:00 |
| | 20:00〜20:45 |

- 会員には他の会員の氏名・番号・メールを返しません。予約済み人数、ご本人の予約状態と取消ボタンのみ表示します。
- サーバーで定員・開始時刻・会員状態・ブロックを検査します。予約とブロック更新は同一のScript Lockを使用します。
- 同一会員の同一枠への再送は既存予約を返し、二重登録しません。
- 管理者／マネージャーは枠ごと、または1日分の11枠をブロック・解除できます。成立済みの予約は自動取消しません。ブロック後も本人による取消は可能です。
- 通常スタッフはSOGA所属またはcan_9roundが有効な場合に閲覧できます。管理操作はADMIN/MANAGERのみです。
- 日付・時刻は日本時間です。

追加の運用指定がないため、予約可能期間は当日から30日分、予約・取消の締切は各枠の開始時刻、本人確認の有効時間は6時間を初期値としています。予約可能期間は1〜90日に設定変更できます。休会中・退会済み会員の新規予約は受け付けません。

## 体験枠

独立管理画面で、日時・枠名・定員1〜4名・受付可能／停止を後から追加・編集できます。時間は45分で営業時間内に制限します。通常の11枠は変更しません。

今回の範囲は**体験枠の作成・編集とスタッフへの表示**です。未入会者の体験予約受付・デイリーワークアウトとの合算定員・担当者割当は含めていません。通常会員向け予約APIから体験枠への予約はできません。

## 本人確認

登録メールへの6桁コードを使用します。コードは10分有効・1回限り、誤入力5回で失効します。再送は60秒以上あけ、1時間に5回までです。コードとセッショントークンはHMACで保存します。

未登録・休会中・メール重複の場合も会員の存在や氏名を応答に含めません。同一メールを使う複数会員は、別会員を誤って選ばないように予約を止めます。セッション発行後も予約時に会員の有効状態とメールの一致を再確認します。

会員のセッションはブラウザーのsessionStorage、独立管理画面のスタッフ認証はメモリー内に保持します。トークンをURL・localStorageに保存しません。A-nautsの閲覧連携では、既存アプリから更新済みFirebaseトークンを受け取ります。

## 独立開発環境の設定

開発用GAS：[9ROUND Booking DEV - isolated](https://script.google.com/home/projects/1bMtNarNVT3JKIDA-w_vmWKD-jfaODvBRtEL6qNCQF3HQkg_qsl4yVifq/edit)。コード・会員画面・スタッフ画面と、テスト宛先・Firebase公開Web APIキーを保存しました。初回実行のGoogle認証待ちで、テストデータの初期化・実メール確認は未完了です。

1. 新規の独立Apps Scriptプロジェクトを使います。リポジトリ直下の既存gas/や既存clasp設定は使いません。
2. 次のコマンドで、静的ページからGAS用のMember.html・Staff.htmlを再生成します。

       node scripts/build-9round-gas-pages.mjs

3. このディレクトリーのgas/内のソースとHTMLを新規GASへ配置します。
4. 開発時はROUND9_BOOKING_TEST_EMAILSに自身が受信できるメールを1件、ROUND9_BOOKING_FIREBASE_API_KEYに既存Firebaseの公開Web APIキーを設定します。
5. initialize9RoundBookingDevelopmentを実行すると、新しい予約データ・架空会員マスター・架空スタッフ名簿の3スプレッドシートを作成します。会員は9000000の開発テスト会員だけで、実会員マスターはコピーしません。設定済みプロジェクト・production設定での再初期化は拒否します。既存シートへ書き込みません。
6. マニフェストのアクセスはMYSELF（自分のみ）です。テストデプロイのURLで?page=memberまたは?page=staffを開いて確認します。
7. GAS内の画面はgoogle.script.runで同じ認証済みAPI処理を呼ぶため、非公開の開発デプロイを使えます。GitHub PagesやA-nautsの本番反映は不要です。
8. 最終確認前にmainへのマージ・本番デプロイ・一般公開を実行しません。

手動で接続先を構成する場合のプロパティ一覧です。予約用5シートの作成はsetup9RoundBookingStorage_が担当し、開発初期化から呼び出します。

| Script Property | 設定 |
| --- | --- |
| ROUND9_BOOKING_ENABLED | true。未設定は全API停止 |
| ROUND9_BOOKING_ENV | development（既定）またはproduction |
| ROUND9_BOOKING_SPREADSHEET_ID | 新規の予約データ用ID。会員マスター・A-nauts本体用シートと共用しません |
| ROUND9_BOOKING_MEMBER_MASTER_ID | テスト用9ROUND会員マスターID |
| ROUND9_BOOKING_MEMBER_MASTER_SHEET | 会員マスターのタブ名 |
| ROUND9_BOOKING_SECRET | 32文字以上のランダムな秘密値。Gitに保存しません |
| ROUND9_BOOKING_TEST_EMAILS | テストを許可する会員・スタッフのメール。カンマ区切り |
| ROUND9_BOOKING_DAYS | 予約可能日数、既定30、1〜90 |
| ROUND9_BOOKING_FIREBASE_API_KEY | 既存Firebaseの公開Web APIキー |
| ROUND9_BOOKING_STAFF_DIRECTORY_ID | 開発時はテスト用スタッフ名簿ID。本番運用時はA-nauts名簿を読み取りのみで参照 |

開発設定では、既存9ROUNDマスターの既知IDやROUND9_MEMBER_MASTER_IDと一致するマスターを拒否し、許可リスト以外に確認コードを送信しません。

## 検証

    node --test tests/9round-booking.test.js

新機能の24件が成功しています。GASサービスのローカルテスト実装で、定員・再送・取消・ブロック・認証・権限・体験枠・データ分離を検証しています。実際のGASデプロイ先・実メール・実会員データでの確認は未実施です。

ローカルのテストデータとGASテスト実装を接続したChromiumで、会員のメール確認→予約→取消、満員・ブロックの選択不可、管理者のブロック／解除、体験枠作成、一般スタッフの管理操作非表示、A-nautsの閲覧専用連携、ログアウト時の情報消去を確認しています。320／390／1024／1280pxで横にはみ出さず、ブラウザー例外もありません。

既存テストには変更前から17件の失敗があります（旧ファイル名・旧アセットのバージョンを前提にするチェックなど）。変更前コミット941cd5271449ee0732837651f376a5f56333edb1との比較で、新規テスト以外に失敗の増加がないことを確認しています。
