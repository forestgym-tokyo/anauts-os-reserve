# 99_Main.gs — 女性限定トレーナーポリシー連携

PR #7の現行 `gas/99_Main.gs` には必要な連携が反映済みです。旧PRのファイルへ置き換えたり、スタッフ確認用ルートを新規追加したりする必要はありません。

## 必須の公開予約ルート

`doPost` の `createReservation` は、必ずポリシー経由にします。

```javascript
case "createReservation":
  return createReservationWithTrainerPolicy_(
    body
  );
```

## 現行動作

- `policy_check_only=true`：予約を作らず、会員マスターの性別状態を返す。
- 会員マスター `gender=F`：吉丸トレーナーを含む全トレーナーを予約可能。
- 会員マスター `gender=M`：吉丸トレーナーは予約不可。
- 会員マスター `gender=空欄`：画面回答を当該予約中だけ使用する。
- 無料体験：画面回答を当該予約中だけ使用する。
- パーソナル系予約の `staff_code` 未指定：`PERSONAL_TRAINER_REQUIRED` で拒否する。
- 吉丸トレーナーを明示した男性予約：`YOSHIMARU_FEMALE_ONLY` で拒否する。

担当者未指定のまま `createReservation()` の自動割当に進ませないことで、性別確認後に吉丸トレーナーが割り当てられる抜け道を防ぎます。

## 廃止済みの旧方式

- 来店後のスタッフ確認
- 管理画面の「吉丸 初回確認」
- `trainer_customer_verifications` への確認記録
- HMACによる確認済み利用者管理

会員の性別情報は `master` シートの `gender` 列だけを正本とします。画面回答から同列を自動更新しません。
