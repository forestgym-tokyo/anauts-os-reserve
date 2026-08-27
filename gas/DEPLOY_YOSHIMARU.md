# 吉丸トレーナー初回確認 — GAS反映手順

## 反映対象

Apps Script の A-nauts OS Reserve プロジェクトへ、PR #5 の以下2ファイルを反映する。

1. `gas/59_YoshimaruGender.gs`
   - Apps Script に `59_YoshimaruGender` というスクリプトファイルを新規作成し、内容を貼り付ける。
2. `gas/99_Main.gs`
   - 現在の `99_Main.gs` をバックアップしたうえで、PR #5 の `gas/99_Main.gs` に置き換える。
   - このファイルは 2026-08-26 時点の最新 `99_Main.gs` に吉丸用3ルートを統合したもの。

## 追加されるAPI

### 公開予約 POST

`createReservation` は `createReservationWithTrainerPolicy_()` を経由する。

- 吉丸以外：従来どおり
- 吉丸・スタッフ確認済み：従来どおり
- 吉丸・未確認・genderなし：`YOSHIMARU_GENDER_REQUIRED`
- 吉丸・未確認・gender=男性：`YOSHIMARU_FEMALE_ONLY`
- 吉丸・未確認・gender=女性：予約可能。ただし確認済みにはしない

### 管理画面 GET

`getPendingYoshimaruVerifications`

- Firebaseログイン必須
- ADMIN / MANAGER / STAFF
- 今日〜過去30日の来店済み・未確認予約を返す
- 未来予約は返さない

### 管理画面 POST

`verifyYoshimaruCustomer`

- Firebaseログイン必須
- ADMIN / MANAGER / STAFF
- 来店済みの吉丸予約だけ確認済みにできる
- 操作者の staff_code / email / 日時を監査記録する

## 自動生成されるもの

初めてスタッフ確認を登録した時点で、スプレッドシートに以下のシートを自動作成する。

`trainer_customer_verifications`

保存項目：

- verification_id
- staff_code
- identity_type
- identity_hash
- eligible
- reservation_id
- verified_by_staff_code
- verified_by_email
- verified_at
- source

性別そのもの、会員番号の生値、顧客メールアドレスの生値はこのシートには保存しない。

本人識別は Script Properties の `YOSHIMARU_IDENTITY_SECRET` をキーにした HMAC-SHA256 を使用する。この秘密値は初回利用時に自動生成されるため、手動設定は不要。

## デプロイ

Apps Script 反映後：

1. 保存
2. 「デプロイ」→「デプロイを管理」
3. 現在のWebアプリを編集
4. 「新バージョン」でデプロイ
5. 実行ユーザー・アクセス権を従来設定から変更しない
6. WebアプリURLが既存URLのままであることを確認

既存公開URL：

`https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec`

## GASデプロイ後の確認

### 1. 既存機能

- `health` が正常
- 通常のパーソナル予約が正常
- 吉丸以外のトレーナー予約が正常
- 管理画面ログインが正常

### 2. 吉丸・未確認

- 吉丸トレーナーを選択
- 1回目の予約送信で性別確認が表示される
- 男性 → 予約不可
- 女性 → 予約成功
- 予約成功だけでは `trainer_customer_verifications` に確認済みレコードが作られない

### 3. スタッフ確認前の再予約

- 同じ会員番号 / メールで再び吉丸トレーナーを予約
- 再度性別確認が表示される

### 4. スタッフ確認

- 来店日当日以降に管理画面の「吉丸 初回確認」を開く
- 対象者が確認待ち一覧に表示される
- 「確認済みにする」を実行
- `trainer_customer_verifications` に HMAC識別値と確認者情報が保存される

### 5. スタッフ確認後

- 同じ利用者が吉丸トレーナーを予約
- 性別確認なしで予約できる

### 6. 無料体験

- 担当トレーナーを選択しないと日時へ進めない
- 選択したトレーナーの空き時間だけ表示される
- 吉丸選択時は上記性別ルールが適用される

## GitHub公開順序

GASを先にデプロイし、上記のバックエンド確認が取れてから PR #5 を `main` へマージする。

**フロントだけを先にマージしないこと。**
