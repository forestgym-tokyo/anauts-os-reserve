# A-nauts OS Reserve 共通フロント v2

対応URL:

- `/personal/`
- `/trial/`
- `/tour/`
- `/counsel/`
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
