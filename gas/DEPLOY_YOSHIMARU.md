# 女性限定トレーナーポリシー — GAS反映手順

## 前提

性別情報の正本は、会員マスター `master` シートの `gender` 列です。

- `F`：女性
- `M`：男性
- 空欄・想定外の値：予約判定上はMと同じ扱い

通常パーソナル・会員専用の無料体験とも、会員番号＋登録メールで同じ会員マスターを照合します。

## 反映対象

最新版の以下2ファイルをApps Scriptプロジェクトへ反映します。

1. `gas/59_YoshimaruGender.gs` を同名ファイルへ全置換する。
2. `gas/99_Main.gs` を同名ファイルへ全置換する。

今回のiPad対策では、`99_Main.gs` に `getAvailableSlotsRange` のGETルートが必要です。片方だけの反映では週単位取得に切り替わりません。

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
- `getPersonalBookingEligibility` に会員番号と登録メールを指定すると、予約を作成せずに `yoshimaru_eligible=true/false` が返る。
- `getAvailableSlotsRange` に `service_code`、`staff_code`、`start_date`、`days=7` を指定すると、`data.results` に7日分が返る。
- `policy_check_only=true` で予約が作成されず、`yoshimaru_eligible=true/false` が返る。
- 無料体験で会員マスターにない会員番号を指定すると `MEMBER_NOT_FOUND` になる。
- パーソナル系予約で `staff_code` を省略すると `PERSONAL_TRAINER_REQUIRED` になる。
- M会員が `staff_code=YOSHIMARU` を指定すると `YOSHIMARU_FEMALE_ONLY` になる。
- gender空欄会員が `staff_code=YOSHIMARU` を指定しても `YOSHIMARU_FEMALE_ONLY` になる。
- 吉丸以外を明示した正常なパーソナル予約は従来どおり成功する。

### 予約画面

- F会員：吉丸を含む全トレーナーを表示し、担当者を1人選んでから日程を表示する。
- M会員：吉丸を表示せず、吉丸以外の担当者を1人選んでから日程を表示する。
- 空欄会員：Mと同じく吉丸を表示せず、担当者を選んでから日程を表示する。
- 無料体験：会員専用として、会員番号＋登録メールを確認してから日程を表示する。
- 無料体験のF会員：吉丸を含む全トレーナーを表示し、担当者を1人選んでから日程を表示する。
- 無料体験のM・空欄会員：吉丸を表示せず、担当者を選んでから日程を表示する。
- iPadを含むモバイル端末：担当者未選択時に空き枠通信が発生しない。
- iPadを含むモバイル端末：担当者選択後の7日分を、4日分＋3日分の最大2通信で取得する。
- トレーナー選択後にプランを変更：担当者を未選択へ戻し、再選択後に新プランを取得する。

## 公開順序

1. 最新 `59_YoshimaruGender.gs` と `99_Main.gs` をApps Scriptへ反映する。
2. Webアプリを新バージョンでデプロイする。
3. 上記API確認を実施する。
4. iPad対策PRを `main` へマージする。
5. 公開予約画面の実機確認を実施する。

**GASの確認前にフロントだけを公開しないでください。**
