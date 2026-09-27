# Apps Script / clasp 同期

## GASファイル番号

- 79–87: MPG / 9ROUND 休会・退会
- 88: Diet Counseling
- **89–90: 9ROUND 面接系の予約領域（Apps Script側に既存ファイルあり）**
- **91: TFG退会精算コア** `91_TfgSettlementApproval.gs`
- **92: TFG退会精算WebApp補助** `92_TfgSettlementApprovalWebApp.gs`
- 99: メインルーター `99_Main.gs`

## 重要

`clasp push` はApps Scriptプロジェクト全体を書き換えるため、
Apps Script側にだけ存在するファイルをGitHubへ取り込む前にPushしてはいけません。

現在、Apps Script側には `89_9RoundInterview...` / `89_1_9RoundInterview...` が見えており、
GitHubにはまだ存在していません。

### 初回移行順序

1. Google Apps Script APIを有効化する。
2. ローカルで `clasp login` を実行して `~/.clasprc.json` を取得する。
3. GitHub Actions Secretsへ以下を登録する。
   - `CLASPRC_JSON`: `~/.clasprc.json` の内容
   - `CLASP_JSON`: 対象プロジェクトの設定。例:
     ```json
     {"scriptId":"<SCRIPT_ID>","rootDir":"gas"}
     ```
4. GitHub Actionsの **GAS Pull (safe)** を先に実行する。
5. `gas/appsscript.json` と既存の `89*9RoundInterview*.gs` がGitHubへ取り込まれたことを確認する。
6. その後のみ **GAS Push (manual guarded)** を使用する。

## Push

Pushは自動実行しません。
GitHub Actionsから手動で実行し、確認欄に `PUSH_TO_GAS` と入力した場合のみ実行します。

既存WebアプリのデプロイはPushとは別です。
ソース同期後、既存Deployment IDを更新すれば公開URLを変えずに再デプロイできます。
