# Wix HP更新予約アプリ

Wixで保存済みのHPを、指定した日本時間以降に自動公開するためのGoogle Apps Scriptアプリです。

- [アプリ一式をダウンロード](https://raw.githubusercontent.com/forestgym-tokyo/anauts-os-reserve/refs/heads/wix-publish-scheduler-downloads/downloads/wix-publish-scheduler/wix-publish-scheduler.zip)
- [スマホ画面のイメージ](./app-mobile.png)
- [PC画面のイメージ](./app-desktop.png)

ZIPをすべて展開してください。導入手順はREADME.md、WixのAPIキーの用意はWIX-API-KEY.mdにあります。

この配布はアプリの設置・Wixへの接続・実公開を行うものではありません。Wixへの本番接続は未確認です。初回のGoogleへの設置と、対象サイトのAPIキー・サイトIDが必要です。

Googleの毎分トリガーで動作するため、指定時刻から数分遅れる場合があります。5分を超える遅れでは公開せず、通信結果不明時も自動再送しません。公開時点の保存済み変更すべてが対象です。

検証：模擬WixによるNodeテスト19件、320/390/768/1280pxのブラウザーテスト成功。Windowsの導入スクリプト自体と実サービス接続は未実行です。

このブランチは配布ファイル用です。mainと既存の予約システムの公開版は更新しません。
