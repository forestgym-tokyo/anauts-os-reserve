/**
 * ============================================================
 * A-nauts OS Reserve
 * 50.1 5サービスメールテンプレート 改行修正
 * ============================================================
 *
 * v50で本文中の改行が「\n」という文字列として
 * mail_templatesへ保存されてしまった問題を修正する。
 *
 * GASエディタから1回だけ実行:
 * fixFiveServiceMailTemplateLineBreaks_v50_1()
 */

function fixFiveServiceMailTemplateLineBreaks_v50_1() {

  const targetServices = [
    "TRAINING_SUPPORT45",
    "COUNSEL",
    "UNSUBSCRIBE",
    "PROCEDURE",
    "MEAL_PLANNING"
  ];

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

  if (values.length < 2) {
    throw new Error(
      "mail_templatesにデータがありません。"
    );
  }

  const headers =
    values[0].map(function(v) {
      return String(v || "").trim();
    });

  const serviceIndex =
    headers.indexOf(
      "service_code"
    );

  const bodyIndex =
    headers.indexOf(
      "body"
    );

  const templateIndex =
    headers.indexOf(
      "template_code"
    );

  if (
    serviceIndex < 0 ||
    bodyIndex < 0
  ) {
    throw new Error(
      "service_code/body列が見つかりません。"
    );
  }

  let updated = 0;
  const updatedTemplates = [];

  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const serviceCode =
      String(
        values[i][serviceIndex] || ""
      )
      .trim()
      .toUpperCase();

    if (
      !targetServices.includes(
        serviceCode
      )
    ) {
      continue;
    }

    const currentBody =
      String(
        values[i][bodyIndex] || ""
      );

    /*
     * 文字として保存されている
     * バックスラッシュ+n を本物の改行へ変換。
     */
    const fixedBody =
      currentBody.replace(
        /\\n/g,
        "\n"
      );

    if (
      fixedBody !== currentBody
    ) {

      sheet
        .getRange(
          i + 1,
          bodyIndex + 1
        )
        .setValue(
          fixedBody
        );

      updated++;

      updatedTemplates.push(
        templateIndex >= 0
          ? String(
              values[i][templateIndex] || ""
            )
          : serviceCode
      );
    }
  }

  SpreadsheetApp.flush();

  const result = {
    ok: true,
    updated_count: updated,
    expected_max: 30,
    updated_templates:
      updatedTemplates
  };

  Logger.log(
    JSON.stringify(
      result
    )
  );

  return result;
}
