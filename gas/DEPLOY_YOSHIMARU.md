# 女性限定トレーナーポリシー — GAS反映手順

## 前提

性別情報の正本は、会員マスター `master` シートの `gender` 列です。

- `F`：女性
- `M`：男性
- 空欄：予約画面で女性／男性を確認

画面回答から会員マスターは自動更新しません。旧 `trainer_customer_verifications` シートとスタッフ確認画面は使用しません。

## 反映対象

PR #7の以下をApps Scriptプロジェクトへ反映します。

1. `gas/59_YoshimaruGender.gs` を同名ファイルへ全置換する。
2. 現行 `99_Main.gs` の `createReservation` が `createReservationWithTrainerPolicy_(body)` を呼んでいることを確認する。

`99_Main.gs` 全体を古いファイルへ置き換えないでください。

## デプロイ

1. Apps Scriptの対象ファイルを保存する。
2. 「デプロイ」→「デプロイを管理」を開く。
3. 現在のWebアプリを編集する。
4. 「新バージョン」でデプロイする。
5. 実行ユーザー・アクセス権を従来設定から変更しない。
6. WebアプリURLが既存URLのままであることを確認する。

既存公開URL：

`https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec`

## GAS先行確認

フロントを公開する前に、以下を確認します。

### API

- `health` が正常に応答する。
- `policy_check_only=true` で予約が作成されず、`FEMALE`／`MALE`／`UNKNOWN` が返る。
- パーソナル系予約で `staff_code` を省略すると `PERSONAL_TRAINER_REQUIRED` になる。
- M会員が `staff_code=YOSHIMARU` を指定すると `YOSHIMARU_FEMALE_ONLY` になる。
- 吉丸以外を明示した正常なパーソナル予約は従来どおり成功する。

### 予約画面

- F会員：吉丸を含む全トレーナー・対象日程を表示する。
- M会員：吉丸を表示せず、吉丸しか空いていない時間も表示しない。
- 空欄会員：日程表示前に女性／男性を確認する。
- 無料体験：日程表示前に女性／男性を確認する。
- 男性回答：最終担当候補からも吉丸を除外する。
- 「新しい予約」：空欄会員・無料体験の自己申告をリセットする。
- トレーナー選択後にプランを変更：新プランを「すべてのトレーナー」で再取得する。

## 公開順序

1. 最新 `59_YoshimaruGender.gs` をApps Scriptへ反映する。
2. Webアプリを新バージョンでデプロイする。
3. 上記API確認を実施する。
4. PR #7を `main` へマージする。
5. 公開予約画面の実機確認を実施する。

**GASの確認前にフロントだけを公開しないでください。**
