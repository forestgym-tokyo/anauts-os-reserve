# GitHub予約画面の公開・復旧手順

公開日：2026-10-17。会員画面だけをGitHub Pagesへ配置し、本人確認・予約・メール・保存先には従来の独立GASを使用します。

| 用途 | URL・履歴 |
| --- | --- |
| 会員向けGitHub画面 | https://forestgym-tokyo.github.io/anauts-os-reserve/9round-booking/ |
| 従来の会員画面 | https://script.google.com/macros/s/AKfycbzVxf1HKZgXet5XrZjqQbzQ47dH8vMISf1mdEE_AH4m3EABceonv1V2OG0jtuIJLvkq/exec?page=member |
| スタッフ画面 | https://script.google.com/macros/s/AKfycbzVxf1HKZgXet5XrZjqQbzQ47dH8vMISf1mdEE_AH4m3EABceonv1V2OG0jtuIJLvkq/exec?page=staff |
| 公開mainコミット | e69554331a9047924a7e57d6610fb485de6df334 |
| 切替前mainの保管ブランチ | backup/before-9round-pwa-20261017（941cd5271449ee0732837651f376a5f56333edb1） |
| 独立GAS | バージョン4（会員ステータスをokのみに限定）。バージョン1〜3も履歴に保持 |

## 従来の画面へ戻す

1. mainの`9round-booking/config.js`で`preferLegacy`を`true`に変更してコミットします。`apiUrl`と`legacyMemberUrl`はそのままです。
2. GitHub Pagesの反映後に会員URLを再読み込みすると、従来のGAS画面へ移動します。インストール済みアプリも、オンラインで次に再読み込みすると同じ設定を取得します。開いたままの画面・通信できない端末に即時反映されるものではありません。
3. 独立GASの「プロジェクトの設定」→スクリプトプロパティで、`ROUND9_BOOKING_MEMBER_URL`を上表の従来の会員画面URLへ戻します。確認・変更メールのリンクも従来の画面へ戻ります。
4. 予約データ・会員マスター・スタッフ名簿を変更しません。初期化関数や本番準備関数を再実行せず、予約を削除しません。

新画面へ戻すときは`preferLegacy`を`false`、`ROUND9_BOOKING_MEMBER_URL`をGitHub会員URLへ戻します。予約は両画面で同じデータを使うため、切替時の移行は不要です。別のオリジンへ移るため、メールによる本人確認はやり直しになります。

GitHubの新規フォルダーを削除する方法では、配布済みURLやインストール済みアプリが開けなくなります。復旧では上記フラグを使って公開URLを残してください。急ぎの場合は従来のGAS URLをそのまま案内できます。

## メールURL設定

| スクリプトプロパティ | GitHub版公開中の値 |
| --- | --- |
| ROUND9_BOOKING_MEMBER_URL | GitHubの会員画面URL |
| ROUND9_BOOKING_CODE_COPY_URL | https://script.google.com/macros/s/AKfycbzVxf1HKZgXet5XrZjqQbzQ47dH8vMISf1mdEE_AH4m3EABceonv1V2OG0jtuIJLvkq/exec?page=code-copy |
| ROUND9_BOOKING_STAFF_URL | 上表のスタッフ画面URL |

コードのコピーボタンはGAS専用ページを開きます。会員画面URLを変更してもコピー用URLはGASのままにします。今回の更新は公開済みバージョン3を反映後、エディターだけの一時関数で2つのURLプロパティを変更し、実行完了と値を確認してから一時関数を削除しました。

## 公開ビルド

ソースの`config.js`は接続先を空に保ち、別フォルダーへ公開用ファイルだけを出力します。

```bash
node scripts/build-9round-gas-pages.mjs
node scripts/build-9round-static.mjs --out /tmp/9round-public --api-url https://script.google.com/macros/s/AKfycbzVxf1HKZgXet5XrZjqQbzQ47dH8vMISf1mdEE_AH4m3EABceonv1V2OG0jtuIJLvkq/exec
```

戻す設定のビルドには末尾へ`--legacy-ui`を付けます。出力した16ファイルだけをmainの`9round-booking/`へ配置します。スタッフ画面やGASソース、テスト用ファイルをこのビルドへ追加しません。

## インストール・キャッシュ

AndroidのChromeでは「アプリをインストール」またはブラウザーのメニューを使用します。iPhoneではSafariの共有→「ホーム画面に追加」を使用します。メール・LINE内のブラウザーではChromeまたはSafariで開き直します。GAS内の画面からはGitHubのインストール用ページを案内します。

Service Workerの範囲は`/9round-booking/`だけです。明示した公開画面・JS・CSS・アイコンだけをネットワーク優先でキャッシュします。API、POST、他のオリジン、会員データ、本人確認トークンはキャッシュしません。オフラインで予約を受け付けたり、あとから自動送信したりしません。

## 確認結果

- サーバーテスト57件、既存ブラウザーテスト28項目が成功。
- Chromiumでmanifestの解析とインストール条件エラー0件を確認。
- 実Service Workerによるオフラインの画面表示、APIを保存しないこと、スマホ幅、GASへの切り戻しを確認。
- 公開GitHubページはHTTP 200。実ブラウザーでインストールボタン・Android/iPhone手順・従来画面のリンクを確認。
- 本番APIの未認証リクエストは`SESSION_EXPIRED`。GitHubオリジン向けCORSヘッダーも確認。
- 実端末のインストール操作と実メール受信は未確認。テストのための実予約・コード送信は行っていません。

会員照合と重複判定は会員ステータスが`ok`の行だけを対象にします。前後の空白を除去しますが、大文字`OK`・`active`・`act`・`契約中`などは対象外です。`ok`の行同士で番号・メールが同じ、名前が空白の違いだけの重複は同一会員として扱い、内容の矛盾する重複は拒否します。コード発行後・本人確認後にステータスが変わった場合も次の操作で再照合します。既存予約は削除しません。会員マスターをプログラムで書き換えていません。
