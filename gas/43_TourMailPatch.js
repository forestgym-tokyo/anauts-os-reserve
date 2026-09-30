/**
 * A-nauts OS Reserve
 * v43 店内見学キャンセル管理通知テンプレート修正
 *
 * 1回だけ手動実行:
 * fixTourCancelledAdminTemplate_v43()
 *
 * TOUR_CANCELLED_ADMIN の本文から
 * 「キャンセル理由：{{cancel_reason}}」を削除する。
 */
function fixTourCancelledAdminTemplate_v43() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      "mail_templates"
    );

  if (!sheet) {
    throw new Error(
      "mail_templatesシートが見つかりません。"
    );
  }

  const values =
    sheet.getDataRange().getValues();

  if (!values.length) {
    throw new Error(
      "mail_templatesシートが空です。"
    );
  }

  const headers =
    values[0].map(function(v) {
      return String(v || "").trim();
    });

  const codeIndex =
    headers.indexOf(
      "template_code"
    );

  const bodyIndex =
    headers.indexOf(
      "body"
    );

  if (
    codeIndex < 0 ||
    bodyIndex < 0
  ) {
    throw new Error(
      "mail_templatesシートにtemplate_code/body列がありません。"
    );
  }

  let updated = false;

  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const code =
      String(
        values[i][codeIndex] || ""
      )
      .trim()
      .toUpperCase();

    if (
      code !==
      "TOUR_CANCELLED_ADMIN"
    ) {
      continue;
    }

    let body =
      String(
        values[i][bodyIndex] || ""
      );

    body =
      body
        .replace(
          /^キャンセル理由：\{\{cancel_reason\}\}\r?\n?/gm,
          ""
        )
        .replace(
          /\n{3,}/g,
          "\n\n"
        )
        .trim();

    sheet
      .getRange(
        i + 1,
        bodyIndex + 1
      )
      .setValue(
        body
      );

    updated = true;
    break;
  }

  if (!updated) {
    throw new Error(
      "TOUR_CANCELLED_ADMINテンプレートが見つかりません。"
    );
  }

  Logger.log(
    JSON.stringify({
      ok: true,
      template_code:
        "TOUR_CANCELLED_ADMIN",
      cancel_reason_removed:
        true
    })
  );
}
