/**
 * ============================================================
 * A-nauts OS Reserve
 * 82_MpgSuspensionDraft.gs
 * My Private Gym 休会URL案内メール下書き
 * ============================================================
 */

function createMpgSuspensionDraft_(member, url, expiresAt) {
  try {
    if (!member || !member.email) {
      throw new Error("会員のメールアドレスを確認できません。");
    }

    const subject = "休会手続きのご案内／My Private Gym";
    const expiryText = Utilities.formatDate(
      expiresAt,
      MPG_SUSPENSION_CONFIG.TIMEZONE,
      "yyyy/MM/dd HH:mm"
    );
    const earliest = getMpgEarliestStartMonth_();
    const earliestText = earliest.replace(/^(\d{4})-(\d{2})$/, "$1年$2月");

    const body = [
      member.name + " 様",
      "",
      "お世話になっております。",
      "My Private Gymでございます。",
      "",
      "休会のお手続きについてご案内いたします。",
      "",
      "下記のURLは、" + member.name + "様専用の休会手続きURLです。",
      "発行から3日間有効となりますので、期限内にお手続きをお願いいたします。",
      "",
      "【休会手続きURL】",
      url,
      "",
      "【URL有効期限】",
      expiryText,
      "",
      "休会開始月は、お手続き時点での最短開始可能月（" + earliestText + "）が表示されます。",
      "",
      "休会期間は1か月～6か月の範囲でお選びいただけます。",
      "休会費は550円／月となり、休会期間分をまとめてお支払いいただきます。",
      "",
      "なお、毎月9日20:00までにお手続きいただいた場合は翌月1日から、9日20:00を過ぎた場合は翌々月1日からの休会となります。",
      "",
      "また、未払いの会費等がある場合は、精算完了後に休会が適用されます。",
      "休会期間終了後は自動的に通常会員へ復会となり、延長をご希望の場合は改めてお手続きが必要となります。",
      "",
      "ご不明な点がございましたら、お気軽にお問い合わせください。",
      "",
      "何卒よろしくお願いいたします。",
      "",
      "My Private Gym"
    ].join("\n");

    const draft = GmailApp.createDraft(member.email, subject, body);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "会員宛てのGmail下書きを作成しました。",
      "MPG休会届",
      5
    );

    return {
      ok: true,
      draftId: draft.getId(),
      to: member.email,
      subject: subject
    };
  } catch (error) {
    console.error("createMpgSuspensionDraft_", error);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "休会URLは発行しましたが、Gmail下書きの作成に失敗しました。",
      "MPG休会届",
      10
    );
    return {
      ok: false,
      message: error && error.message ? error.message : "Gmail下書きを作成できませんでした。"
    };
  }
}
