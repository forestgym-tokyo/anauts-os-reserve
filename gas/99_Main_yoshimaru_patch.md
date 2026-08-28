# 99_Main.gs — 女性限定トレーナーポリシー連携

PR #7の現行 `gas/99_Main.gs` には必要な連携が反映済みです。

## 必須の公開予約ルート

`doPost` の `createReservation` は、必ずポリシー経由にします。

```javascript
case "createReservation":
  return createReservationWithTrainerPolicy_(
    body
  );
```

## 現行動作

- `policy_check_only=true`：予約を作らず、会員マスターに基づく吉丸予約可否を返す。
- 会員マスター `gender=F`：吉丸トレーナーを含む全トレーナーを予約可能。
- 会員マスター `gender=M`：吉丸トレーナーは予約不可。
- 会員マスター `gender=空欄`・想定外の値：Mと同じく吉丸トレーナーは予約不可。
- 無料体験：会員専用サービスとして、会員番号＋登録メールで同じ会員マスター判定を行う。
- パーソナル系予約の `staff_code` 未指定：`PERSONAL_TRAINER_REQUIRED` で拒否する。
- 吉丸トレーナーを明示した男性予約：`YOSHIMARU_FEMALE_ONLY` で拒否する。

担当者未指定のまま `createReservation()` の自動割当に進ませないことで、会員判定後に吉丸トレーナーが割り当てられる抜け道を防ぎます。

会員の性別情報は `master` シートの `gender` 列だけを正本とします。
