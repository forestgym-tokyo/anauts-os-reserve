# 99_Main.gs patch — 吉丸トレーナー初回性別確認

`59_YoshimaruGender.gs` を同じ Apps Script プロジェクトへ追加したうえで、`99_Main.gs` の `doPost` 内 `createReservation` ルートを変更する。

## 変更前

```javascript
case "createReservation":
  return createReservation(
    body
  );
```

## 変更後

```javascript
case "createReservation":
  return createReservationWithTrainerPolicy_(
    body
  );
```

## 動作

- `staff_code !== "YOSHIMARU"`：従来どおり `createReservation` を実行。
- `staff_code === "YOSHIMARU"` かつ確認済み：性別入力なしで従来どおり予約。
- `staff_code === "YOSHIMARU"` かつ未確認・gender未入力：`YOSHIMARU_GENDER_REQUIRED` を返す。
- `gender === "男性"`：`YOSHIMARU_FEMALE_ONLY` を返し予約しない。
- `gender === "女性"`：予約成功後に確認済み記録を保存。
- 確認済み記録には性別・会員番号・メールアドレスの生値を保存せず、識別用SHA-256ハッシュのみ保存。
- 初回の正常予約時に `trainer_customer_verifications` シートを自動作成する。

## フロントとの組み合わせ

`assets/js/yoshimaru-gender.js` は最初の予約送信で `YOSHIMARU_GENDER_REQUIRED` が返った場合だけ性別欄を表示する。

そのため、過去利用の有無をメールアドレス等で事前照会する公開APIは不要。
