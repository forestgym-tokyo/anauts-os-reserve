# 99_Main.gs patch — 吉丸トレーナー初回性別確認

`59_YoshimaruGender.gs` を同じ Apps Script プロジェクトへ追加したうえで、`99_Main.gs` に以下を追加する。

## 1. 公開予約 createReservation をポリシー経由に変更

### 変更前

```javascript
case "createReservation":
  return createReservation(
    body
  );
```

### 変更後

```javascript
case "createReservation":
  return createReservationWithTrainerPolicy_(
    body
  );
```

## 2. doGet にスタッフ用「確認待ち一覧」を追加

```javascript
case "getPendingYoshimaruVerifications":
  requireAuth_(
    params,
    ["ADMIN", "MANAGER", "STAFF"]
  );
  return getPendingYoshimaruVerifications(
    params
  );
```

## 3. doPost にスタッフ用「確認済み登録」を追加

```javascript
case "verifyYoshimaruCustomer":
  requireAuth_(
    body,
    ["ADMIN", "MANAGER", "STAFF"]
  );
  return verifyYoshimaruCustomer(
    body
  );
```

## 動作

- `staff_code !== "YOSHIMARU"`：従来どおり `createReservation` を実行。
- 吉丸トレーナーでスタッフ確認済み：性別入力なしで予約。
- 吉丸トレーナーで未確認・`gender` 未入力：`YOSHIMARU_GENDER_REQUIRED` を返す。
- `gender === "男性"`：`YOSHIMARU_FEMALE_ONLY` を返し予約しない。
- `gender === "女性"`：予約は許可するが、自己申告だけでは確認済みにしない。
- 来店後に管理画面の「吉丸 初回確認」からスタッフが確認済みにする。
- 未来日の予約は確認済みにできない。
- スタッフ確認後のみ、次回以降は性別質問を表示しない。

## 保存内容

初回のスタッフ確認時に `trainer_customer_verifications` シートを自動作成する。

性別そのものは保存しない。会員番号・メールアドレスの生値も専用シートには保存せず、Script Properties に自動生成した秘密値をキーとする HMAC-SHA256 の識別ハッシュのみ保存する。

確認履歴として以下を保存する。

- `reservation_id`
- `verified_by_staff_code`
- `verified_by_email`
- `verified_at`
- `source`

## フロント

- `assets/js/yoshimaru-gender.js`：吉丸トレーナー未確認時だけ性別質問を表示。
- `admin/admin-yoshimaru-verification.js`：来店済み・未確認者を管理画面から確認済みにする。
- `admin/firebase-config.js`：上記管理画面スクリプトを読み込む。

過去利用の有無をメールアドレス等で事前照会する公開APIは使用しない。
