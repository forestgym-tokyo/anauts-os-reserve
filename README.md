# A-nauts OS Reserve 共通フロント v2

対応URL:

- `/personal/`
- `/trial/`
- `/tour/`
- `/counsel/`（ONLINE／対面を選択、初期値ONLINE）
- `/diet-counseling/`（予約者専用の事前回答フォーム）
- `/procedure/`
- `/meal-planning/`
- `/unsubscribe/`

主な機能:

- `getServices`でservicesシートを読込
- `/personal/`はcategory=PERSONALの公開サービスをカード表示
- `PT60`と`PT_TRIAL60`は通常プラン一覧から除外
- `form_type`に応じてMEMBER / VISITOR / BOTHを切替
- 7日表示＋前週・次週
- 共通HTML・共通JavaScript

## 9ROUND ONLINE面接案内

管理画面からの面接案内下書き作成と、Indeed応募通知を起点にした自動下書き作成を追加しています。反映手順は `gas/DEPLOY_9ROUND_INTERVIEW_DRAFT.md` を参照してください。
