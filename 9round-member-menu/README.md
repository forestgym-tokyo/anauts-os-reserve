# 9ROUND_Member 休会URL送信メニュー

`Code.gs` は `9ROUND_Member` に紐づく Apps Script 専用です。A-nauts OS Reserve Web App の `gas/` とは別のプロジェクトとして管理します。

1. `9ROUND_Member` の「拡張機能 → Apps Script」を開き、スクリプトファイルを新規作成して `Code.gs` の全文を貼り付けて保存します。既存のスクリプトは消しません。
2. 関数一覧から `install9RoundSuspensionMenu` を選択して1回実行し、Googleの権限確認を完了します。
3. スプレッドシートを再読み込みします。「9ROUND休会届 → 選択会員へ休会URLをメール送信」が表示されます。

会員番号、登録メールアドレス、会員ステータスを選択行から確認し、72時間有効の個別URLを登録メールへ送ります。発行履歴は既存の「休会URL発行」タブに記録します。古いURLは新しいメールの送信に成功した後で無効化します。返信先は `9round.ariosoga@gmail.com` です。

GitHub にファイルを置くだけではシートの Apps Script へ反映されません。設置後はテスト会員で送信し、メール到着・新規ログ・専用URLの検証を確認してください。
