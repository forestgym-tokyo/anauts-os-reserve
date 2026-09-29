# 9ROUND_Member 休会URL送信メニュー

`Code.gs` は [9ROUND_Member](https://docs.google.com/spreadsheets/d/1TT7TMIsHn8HXZCL6R0MyM6mOgx2kW9JRYghxC8JYemQ/edit) に紐づく Apps Script 専用です。A-nauts OS Reserve Web App 側の `gas/` とは別のプロジェクトとして管理します。

このコードを対象シートの「拡張機能 → Apps Script」に反映し、シートを再読み込みすると「9ROUND休会届 → 選択会員へ休会URLをメール送信」が表示されます。既存の `onOpen` がある場合は、同名関数を増やさず、その関数からメニュー作成処理を呼び出す形に統合してください。

会員番号、登録メールアドレス、会員ステータスを選択行から確認し、72時間有効の個別URLを登録メールへ送ります。発行履歴は既存の「休会URL発行」タブに記録します。古いURLは新しいメールの送信に成功した後で無効化します。返信先は `9round.ariosoga@gmail.com` です。

GitHub にファイルを置くだけではシートの Apps Script へ反映されません。設置後はテスト会員で送信し、メール到着・新規ログ・専用URLの検証を確認してください。
