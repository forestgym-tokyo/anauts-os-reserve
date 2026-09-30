/**
 * ============================================================
 * A-nauts OS Reserve
 * TOURメール文面 最小修正
 * ============================================================
 *
 * 対象は以下2テンプレートの本文のみ。
 * その他のTOURテンプレート・設定には触れない。
 *
 * GASエディタから1回だけ実行:
 *   updateTourCustomerMailText_v52()
 */

function updateTourCustomerMailText_v52() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("mail_templates");

  if (!sheet) {
    throw new Error("mail_templatesシートが見つかりません。");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("mail_templatesにデータがありません。");
  }

  const headers = values[0].map(function(v) {
    return String(v || "").trim();
  });

  const codeCol = headers.indexOf("template_code");
  const bodyCol = headers.indexOf("body");

  if (codeCol < 0 || bodyCol < 0) {
    throw new Error("template_code または body 列が見つかりません。");
  }

  const changes = {
    "TOUR_UPDATED_CUSTOMER": {
      from: "店内見学のご予約内容を変更しました。",
      to: "店内見学のご予約日時が変更されました。"
    },
    "TOUR_CANCELLED_CUSTOMER": {
      from: "以下の店内見学予約をキャンセルしました。",
      to: "以下の店内見学のご予約がキャンセルされました。"
    }
  };

  const updated = [];
  const notFound = [];

  Object.keys(changes).forEach(function(templateCode) {

    let found = false;

    for (let r = 1; r < values.length; r++) {

      const code = String(values[r][codeCol] || "").trim();

      if (code !== templateCode) {
        continue;
      }

      found = true;

      const currentBody = String(values[r][bodyCol] || "");
      const change = changes[templateCode];

      if (currentBody.indexOf(change.from) < 0) {
        throw new Error(
          templateCode +
          " の現在本文に想定した旧文言が見つかりません。安全のため更新を中止しました。"
        );
      }

      const newBody = currentBody.replace(
        change.from,
        change.to
      );

      sheet.getRange(r + 1, bodyCol + 1).setValue(newBody);

      updated.push(templateCode);
      break;
    }

    if (!found) {
      notFound.push(templateCode);
    }
  });

  if (notFound.length) {
    throw new Error(
      "対象テンプレートが見つかりません: " +
      notFound.join(", ")
    );
  }

  SpreadsheetApp.flush();

  const result = {
    ok: true,
    updated_count: updated.length,
    updated_templates: updated
  };

  Logger.log(JSON.stringify(result));
  return result;
}
