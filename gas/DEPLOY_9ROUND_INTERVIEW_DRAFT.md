# 9ROUND ONLINE面接案内・Indeed自動下書きの反映手順

## 構成

- A-nauts OS Reserve 管理画面
  - 応募者氏名・メールアドレスの手入力
  - KAWAKAMI / YACHIYO勤務シフトとGoogleカレンダーから4日分を抽出
  - 案内文プレビュー
- A-nautsメインGAS（`info@theforestgym.com`）
  - 面接候補の抽出と再検証
  - Indeed応募通知を約5分ごとに確認
  - 9ROUND専用GASへ下書き作成を依頼
- 9ROUND申請GAS（`9round.ariosoga@gmail.com`）
  - `GmailApp.createDraft()`で下書きのみ作成
  - 実行アカウントが `9round.ariosoga@gmail.com` でなければ停止

メールは自動送信しない。作成先は `9round.ariosoga@gmail.com` のGmail下書きである。

## 1. 9ROUND申請GASへ反映

既存の9ROUND会員申請GASプロジェクトへ次を反映する。

- `90_9RoundInterviewDraftService.gs` を追加
- `85_9RoundWithdrawalWebApp.gs` の `create9RoundInterviewDraft` ルートを反映

このGASは必ず `9round.ariosoga@gmail.com` が所有し、Webアプリを「自分として実行」でデプロイする。

エディタから次を1回実行する。

```javascript
setup9RoundInterviewDraftService()
```

戻り値の `sender` が `9round.ariosoga@gmail.com` であることを確認し、`sharedSecret` を控える。共有シークレットは第三者へ送らない。

既存Webアプリを「新しいバージョン」で再デプロイする。URLは既存の次のURLを維持する。

```text
https://script.google.com/macros/s/AKfycbyT8G6rQ-9LFosbFlzSYj4OM0PrCG_KD7bddVxQ65RLMkfYrjmBZ2ebCvL54ncGJSZ2/exec
```

## 2. A-nautsメインGASへ反映

メインGASプロジェクトへ次を反映する。

- `89_9RoundInterviewWorkflow.gs` を追加
- `99_Main.gs` の次のルートを反映
  - `get9RoundInterviewCandidates`
  - `get9RoundInterviewAutomationStatus`
  - `preview9RoundInterviewDraft`
  - `create9RoundInterviewDraft`

エディタで、手順1の共有シークレットを使って次を1回実行する。

```javascript
configure9RoundInterviewDraftService(
  "https://script.google.com/macros/s/AKfycbyT8G6rQ-9LFosbFlzSYj4OM0PrCG_KD7bddVxQ65RLMkfYrjmBZ2ebCvL54ncGJSZ2/exec",
  "手順1で発行したsharedSecret"
)
```

メインWebアプリを新しいバージョンで再デプロイする。

## 3. Indeed自動処理を有効化

メインGASを `info@theforestgym.com` で開き、次を1回実行して権限を許可する。

```javascript
setup9RoundIndeedAutomation()
```

この実行時刻より後に届いた新着だけが対象になる。過去の応募通知を一括処理しない。

自動処理は次の条件をすべて満たすメールだけを対象にする。

- 送信元が `@indeedemail.com`
- 件名が `[新しい応募者のお知らせ]` を含む
- 件名が `ボクササイズスタジオのスタッフ` を含む
- `X-Indeed-Content-Type` が `bundled_application_email_jp_individual` の個別応募通知である

成功時は `A-nauts/9ROUND面接下書き作成済み`、解析失敗や候補不足時は `A-nauts/9ROUND面接下書き要確認` のラベルを元メールへ付ける。処理履歴は `round9_interview_draft_log` シートへ保存する。

## 4. 管理画面

GitHub Pages反映後、A-nauts OS Reserveの「登録」から「9ROUND面接案内」を開く。

- 応募者氏名・メールアドレスを入力
- 4日分の候補を確認・必要に応じて修正
- 「案内文を確認」
- 「9ROUNDのGmail下書きを作成」

候補はすべて11:00〜20:00、30分以上、4つの異なる日付でなければ作成できない。下書き作成直前にも勤務シフトとカレンダーを再確認する。
