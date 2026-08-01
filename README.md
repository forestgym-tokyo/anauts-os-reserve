# A-nauts OS Reserve Release 1 Front

## 実装済み
- `/personal/`
  - 4プランカード選択
  - 7日表示
  - 前週・次週
  - 会員マスター照合予約
- `/trial/`
  - 無料体験専用URLの入口
- 共通CSS/JS構成

## servicesシートに必要なservice_code
- PT_DIET60
- PT_ENTRY60
- PT_PURPOSE60
- PT_PRIME60
- PT_TRIAL60

4つの通常プランが未登録の場合、フロントは表示されても空き枠APIはSERVICE_NOT_FOUNDになります。
