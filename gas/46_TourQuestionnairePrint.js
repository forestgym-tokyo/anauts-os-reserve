/**
 * ============================================================
 * A-nauts OS Reserve
 * 46_TourQuestionnairePrint.gs
 * 店内見学 アンケート／入会登録書 PDF生成
 * ============================================================
 *
 * 前提:
 * A-nauts OS Reserve のマスタースプレッドシート内に
 * テンプレートシート「アンケート・入会登録」が存在すること。
 *
 * 元Excelの転記セル:
 * F3  氏名
 * G4  郵便番号
 * F5  住所
 * F6  電話番号（結合セルF6:N6の左上）
 * F7  メールアドレス
 * D39 見学日時
 *
 * print_mode:
 * FULL         = 全部転記
 * ADDRESS_ONLY = 住所のみ
 * BLANK        = すべて空欄
 */

const TOUR_PRINT_TEMPLATE_SHEET = "アンケート・入会登録";
const TOUR_PRINT_AREA = "A1:AF68";
const TOUR_PRINT_DRIVE_ROOT_FOLDER = "A-nauts OS Reserve";
const TOUR_PRINT_DRIVE_FOLDER = "TourQuestionnaireTemp";


function generateTourQuestionnairePdf(params) {

  const lock =
    LockService.getDocumentLock();

  try {

    lock.waitLock(30000);

    params = params || {};

    const reservationId =
      String(
        params.reservation_id || ""
      ).trim();

    const printMode =
      String(
        params.print_mode || "FULL"
      ).trim().toUpperCase();

    if (!reservationId) {
      return errorResponse(
        "reservation_idを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (
      ![
        "FULL",
        "ADDRESS_ONLY",
        "BLANK"
      ].includes(printMode)
    ) {
      return errorResponse(
        "印刷モードが正しくありません。",
        "INVALID_PRINT_MODE",
        {
          print_mode:
            printMode
        }
      );
    }

    const reservationInfo =
      findReservationRowById_(
        reservationId
      );

    if (!reservationInfo) {
      return errorResponse(
        "指定された予約が見つかりません。",
        "RESERVATION_NOT_FOUND",
        {
          reservation_id:
            reservationId
        }
      );
    }

    const reservation =
      reservationInfo.record || {};

    const serviceCode =
      String(
        reservation.service_code || ""
      ).trim().toUpperCase();

    const customerType =
      String(
        reservation.customer_type || ""
      ).trim().toUpperCase();

    const memberNo =
      String(
        reservation.member_no || ""
      ).trim();

    const isTour =
      serviceCode === "TOUR";

    const isCounselVisitor =
      serviceCode === "COUNSEL" &&
      (
        customerType === "VISITOR" ||
        (
          customerType !== "MEMBER" &&
          !memberNo
        )
      );

    /*
     * 対象は以下だけ。
     * - TOUR
     * - COUNSEL の非会員
     *
     * PDF生成方式・2ページ物理分割は
     * 昨日確定した v46 を一切変更しない。
     */
    if (
      !isTour &&
      !isCounselVisitor
    ) {
      return errorResponse(
        "この予約はアンケート作成対象ではありません。",
        "QUESTIONNAIRE_NOT_AVAILABLE",
        {
          service_code:
            serviceCode,
          customer_type:
            customerType
        }
      );
    }

    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const templateSheet =
      spreadsheet.getSheetByName(
        TOUR_PRINT_TEMPLATE_SHEET
      );

    if (!templateSheet) {
      return errorResponse(
        "テンプレートシート「" +
          TOUR_PRINT_TEMPLATE_SHEET +
          "」が見つかりません。",
        "TOUR_TEMPLATE_NOT_FOUND"
      );
    }

    const tempName =
      "_TOUR_PRINT_" +
      Utilities.formatDate(
        new Date(),
        APP_CONFIG.TIMEZONE,
        "yyyyMMdd_HHmmss_SSS"
      );

    const tempSheet =
      templateSheet.copyTo(
        spreadsheet
      );

    tempSheet.setName(
      tempName
    );

    /*
     * 白紙の3ページ目対策。
     * PDF化専用の一時シートでは帳票本文終了後の71行目以降を物理削除する。
     */
    if (
      tempSheet.getMaxRows() > 68
    ) {
      tempSheet.deleteRows(
        69,
        tempSheet.getMaxRows() - 68
      );
    }

    try {

      /*
       * まず可変セルを必ず空欄化。
       * テンプレートにテスト値等が残っていても印刷しない。
       */
      [
        "F3",
        "G4",
        "F5",
        "F6",
        "F7",
        "D39"
      ].forEach(function(a1) {
        tempSheet
          .getRange(a1)
          .clearContent();
      });


      const customerNameRaw =
        String(
          reservation.customer_name || ""
        ).trim();

      const customerName =
        customerNameRaw
          ? customerNameRaw + " さま"
          : "";

      const postalCode =
        formatTourPrintPostalCode_(
          reservation.postal_code ||
          reservation.postal ||
          reservation.zip_code ||
          reservation.zip ||
          reservation.customer_postal_code
        );

      const address =
        buildTourPrintAddress_(
          reservation
        );

      const customerPhone =
        formatTourPrintPhone_(
          reservation.customer_phone
        );

      const customerEmail =
        String(
          reservation.customer_email || ""
        ).trim();

      /*
       * 電話番号・メールアドレスは
       * 左寄せのまま先頭に1文字分の余白を入れる。
       */
      const customerPhoneForPrint =
        customerPhone
          ? "　" + customerPhone
          : "";

      const customerEmailForPrint =
        customerEmail
          ? " " + customerEmail
          : "";

      const visitDateTime =
        formatTourPrintVisitDateTime_(
          reservation
        );


      if (printMode === "FULL") {

        tempSheet
          .getRange("F3")
          .setValue(customerName);

        tempSheet
          .getRange("G4")
          .setValue(postalCode);

        tempSheet
          .getRange("F5")
          .setValue(address);

        tempSheet
          .getRange("F6")
          .setNumberFormat(
            "@"
          )
          .setValue(
            customerPhoneForPrint
          )
          .setHorizontalAlignment(
            "left"
          );

        tempSheet
          .getRange("F7")
          .setValue(
            customerEmailForPrint
          )
          .setHorizontalAlignment(
            "left"
          );

        tempSheet
          .getRange("D39")
          .setValue(visitDateTime);

      } else if (
        printMode ===
        "ADDRESS_ONLY"
      ) {

        tempSheet
          .getRange("G4")
          .setValue(postalCode);

        tempSheet
          .getRange("F5")
          .setValue(address);

        tempSheet
          .getRange("D39")
          .setValue(visitDateTime);

      }
      // BLANK は6項目すべて空欄のまま。


      SpreadsheetApp.flush();

      /*
       * =====================================================
       * PDFを「必ず2ページ」にする
       * =====================================================
       *
       * Google Sheetsの1シートをPDF化すると、
       * scaleや余白、書式によって1～3ページへ再計算される。
       * そのため1シートの改ページには依存しない。
       *
       * PDF出力専用Spreadsheetを一時作成し、
       *   1枚目 = 元帳票 1～41行
       *   2枚目 = 元帳票 42～68行
       * の2シートに物理分割する。
       *
       * 各シートを「1ページに合わせる」で出力するため、
       * PDFのページ数は構造上2ページになる。
       */
      const exportSpreadsheet =
        SpreadsheetApp.create(
          "_TOUR_PDF_2P_" +
          Utilities.formatDate(
            new Date(),
            APP_CONFIG.TIMEZONE,
            "yyyyMMdd_HHmmss_SSS"
          )
        );

      const exportFile =
        DriveApp.getFileById(
          exportSpreadsheet.getId()
        );

      try {

        const defaultSheet =
          exportSpreadsheet.getSheets()[0];

        const page1 =
          tempSheet.copyTo(
            exportSpreadsheet
          );

        page1.setName(
          "アンケート_1"
        );

        const page2 =
          tempSheet.copyTo(
            exportSpreadsheet
          );

        page2.setName(
          "アンケート_2"
        );

        exportSpreadsheet.deleteSheet(
          defaultSheet
        );

        /*
         * 1ページ目:
         * 1～41行だけ残す。
         */
        if (
          page1.getMaxRows() > 41
        ) {
          page1.deleteRows(
            42,
            page1.getMaxRows() - 41
          );
        }

        /*
         * 2ページ目:
         * 元帳票42～68行だけ残す。
         * 先頭41行を物理削除するため、
         * 2ページ目の内容がシート先頭から始まる。
         */
        if (
          page2.getMaxRows() >= 41
        ) {
          page2.deleteRows(
            1,
            41
          );
        }

        /*
         * 元帳票はAF列まで。
         * 不要な右側列がある場合は物理削除。
         */
        [page1, page2]
          .forEach(function(sheet) {

            if (
              sheet.getMaxColumns() > 32
            ) {
              sheet.deleteColumns(
                33,
                sheet.getMaxColumns() - 32
              );
            }
          });

        SpreadsheetApp.flush();

        /*
         * gid/rangeを指定しないことで、
         * 一時Spreadsheet内の2シートを順番にPDF化する。
         * 各シートはscale=4（1ページに合わせる）。
         *
         * 2シート × 各1ページ = 必ず2ページ。
         */
        const exportUrl =
          "https://docs.google.com/spreadsheets/d/" +
          encodeURIComponent(
            exportSpreadsheet.getId()
          ) +
          "/export" +
          "?format=pdf" +
          "&size=A4" +
          "&portrait=true" +
          "&scale=4" +
          "&sheetnames=false" +
          "&printtitle=false" +
          "&pagenumbers=false" +
          "&gridlines=false" +
          "&fzr=false" +
          "&horizontal_alignment=CENTER" +
          "&top_margin=0.748" +
          "&bottom_margin=0.354" +
          "&left_margin=0.709" +
          "&right_margin=0.709";

        const response =
          UrlFetchApp.fetch(
            exportUrl,
            {
              method:
                "get",
              headers: {
                Authorization:
                  "Bearer " +
                  ScriptApp.getOAuthToken()
              },
              muteHttpExceptions:
                true
            }
          );
      const statusCode =
        response.getResponseCode();

      if (
        statusCode < 200 ||
        statusCode >= 300
      ) {
        throw new Error(
          "PDF生成に失敗しました。HTTP " +
          statusCode
        );
      }

      const pdfBlob =
        response
          .getBlob()
          .setContentType(
            "application/pdf"
          );

      const fileName =
        buildTourPrintFileName_(
          reservation,
          printMode
        );

      pdfBlob.setName(
        fileName
      );

      /*
       * Google Driveへ保存。
       *
       * 保存先:
       * A-nauts OS Reserve / TourQuestionnaireTemp
       *
       * 個人情報を含むため、リンク共有設定は変更しない。
       */
      const saveFolder =
        getOrCreateTourPrintFolder_();

      const pdfFile =
        saveFolder.createFile(
          pdfBlob
        );

      pdfFile.setName(
        fileName
      );

      const fileId =
        pdfFile.getId();

      const fileUrl =
        "https://drive.google.com/file/d/" +
        encodeURIComponent(
          fileId
        ) +
        "/view";

      const folderUrl =
        saveFolder.getUrl();

      logInfo(
        "generateTourQuestionnairePdf",
        "店内見学アンケートPDF生成・Drive保存成功",
        {
          reservation_id:
            reservationId,
          print_mode:
            printMode,
          filename:
            fileName,
          file_id:
            fileId,
          folder:
            TOUR_PRINT_DRIVE_ROOT_FOLDER +
            "/" +
            TOUR_PRINT_DRIVE_FOLDER
        }
      );

      return successResponse({
        reservation_id:
          reservationId,
        print_mode:
          printMode,
        filename:
          fileName,
        mime_type:
          "application/pdf",
        file_id:
          fileId,
        file_url:
          fileUrl,
        folder_url:
          folderUrl,
        drive_folder:
          TOUR_PRINT_DRIVE_ROOT_FOLDER +
          "/" +
          TOUR_PRINT_DRIVE_FOLDER,
        pages:
          2,
        duplex:
          true,
        duplex_instruction:
          "両面印刷・長辺とじ"
      });

      } finally {

        /*
         * PDF出力専用Spreadsheetは一時ファイル。
         * PDF生成後はDriveのゴミ箱へ移動する。
         */
        try {
          exportFile.setTrashed(
            true
          );
        } catch (ignore) {}
      }

    } finally {

      spreadsheet.deleteSheet(
        tempSheet
      );

      SpreadsheetApp.flush();
    }

  } catch (error) {

    logError(
      "generateTourQuestionnairePdf",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      error.message ||
        "アンケートPDF生成中にエラーが発生しました。",
      "TOUR_PRINT_ERROR",
      {
        message:
          error.message
      }
    );

  } finally {

    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}


function formatTourPrintPostalCode_(value) {

  const digits =
    String(value || "")
      .replace(/\D/g, "");

  if (digits.length === 7) {
    return (
      digits.slice(0, 3) +
      "-" +
      digits.slice(3)
    );
  }

  return String(
    value || ""
  ).trim();
}


function buildTourPrintAddress_(reservation) {

  reservation =
    reservation || {};

  const direct =
    String(
      reservation.address ||
      reservation.customer_address ||
      reservation.full_address ||
      ""
    ).trim();

  if (direct) {
    return direct;
  }

  const prefecture =
    String(
      reservation.prefecture ||
      reservation.address_prefecture ||
      ""
    ).trim();

  const city =
    String(
      reservation.city ||
      reservation.municipality ||
      reservation.address_city ||
      ""
    ).trim();

  const detail =
    String(
      reservation.address_detail ||
      reservation.street ||
      reservation.address_line ||
      reservation.address_line1 ||
      ""
    ).trim();

  return [
    prefecture,
    city,
    detail
  ]
    .filter(Boolean)
    .join("");
}


function formatTourPrintVisitDateTime_(reservation) {

  const dateValue =
    reservation.reservation_date ||
    reservation.date ||
    "";

  const startTime =
    normalizeTourPrintTime_(
      reservation.start_time
    );

  const endTime =
    normalizeTourPrintTime_(
      reservation.end_time
    );

  let dateText = "";

  if (
    dateValue instanceof Date &&
    !isNaN(
      dateValue.getTime()
    )
  ) {

    const weekday =
      [
        "日",
        "月",
        "火",
        "水",
        "木",
        "金",
        "土"
      ][dateValue.getDay()];

    dateText =
      Utilities.formatDate(
        dateValue,
        APP_CONFIG.TIMEZONE,
        "yyyy年M月d日"
      ) +
      "(" +
      weekday +
      ")";

  } else {

    const text =
      String(
        dateValue || ""
      ).trim();

    const match =
      text.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/
      );

    if (match) {

      const date =
        new Date(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3])
        );

      const weekday =
        [
          "日",
          "月",
          "火",
          "水",
          "木",
          "金",
          "土"
        ][date.getDay()];

      dateText =
        Number(match[1]) +
        "年" +
        Number(match[2]) +
        "月" +
        Number(match[3]) +
        "日(" +
        weekday +
        ")";

    } else {
      dateText = text;
    }
  }

  const timeText =
    startTime && endTime
      ? startTime +
        " - " +
        endTime
      : startTime ||
        endTime;

  return [
    dateText,
    timeText
  ]
    .filter(Boolean)
    .join(" ");
}


function normalizeTourPrintTime_(value) {

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "HH:mm"
    );
  }

  const text =
    String(
      value || ""
    ).trim();

  const match =
    text.match(
      /^(\d{1,2}):(\d{1,2})/
    );

  if (match) {
    return (
      String(
        Number(match[1])
      ).padStart(2, "0") +
      ":" +
      String(
        Number(match[2])
      ).padStart(2, "0")
    );
  }

  return text;
}



/**
 * 電話番号PDF表示用
 *
 * reservationsで過去に数値化され、
 * 先頭0が落ちた国内電話番号も補正する。
 */
function formatTourPrintPhone_(
  value
) {

  let text =
    String(
      value === null ||
      value === undefined
        ? ""
        : value
    ).trim();

  if (!text) {
    return "";
  }

  /*
   * +81等の国際形式はそのまま。
   */
  if (
    text.indexOf("+") === 0
  ) {
    return text;
  }

  const digits =
    text.replace(
      /\D/g,
      ""
    );

  /*
   * 国内電話番号として保存された値で、
   * 先頭0が欠落している場合は必ず補正する。
   *
   * 例:
   * 474595623   -> 0474595623
   * 474-595-623 -> 0474-595-623
   */
  if (
    digits &&
    digits.charAt(0) !== "0"
  ) {
    text =
      "0" +
      text;
  }

  return text;
}


function buildTourPrintFileName_(
  reservation,
  printMode
) {

  const customerName =
    String(
      reservation.customer_name ||
      "見学者"
    )
      .trim()
      .replace(/[\\/:*?"<>|]/g, "_");

  const modeLabel =
    printMode === "FULL"
      ? "全部"
      : printMode === "ADDRESS_ONLY"
        ? "住所のみ"
        : "空欄";

  const dateText =
    Utilities.formatDate(
      new Date(),
      APP_CONFIG.TIMEZONE,
      "yyyyMMdd_HHmmss"
    );

  return (
    "店内見学アンケート_" +
    customerName +
    "_" +
    modeLabel +
    "_" +
    dateText +
    ".pdf"
  );
}

/**
 * 店内見学アンケートPDF保存先フォルダを取得／作成
 *
 * Drive:
 * A-nauts OS Reserve / TourQuestionnaireTemp
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateTourPrintFolder_() {

  const root =
    findOrCreateDriveFolder_(
      DriveApp.getRootFolder(),
      TOUR_PRINT_DRIVE_ROOT_FOLDER
    );

  return findOrCreateDriveFolder_(
    root,
    TOUR_PRINT_DRIVE_FOLDER
  );
}


/**
 * 指定親フォルダ直下から名称一致フォルダを取得。
 * 無ければ新規作成。
 *
 * @param {GoogleAppsScript.Drive.Folder} parent
 * @param {string} folderName
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function findOrCreateDriveFolder_(
  parent,
  folderName
) {

  const name =
    String(
      folderName || ""
    ).trim();

  if (!name) {
    throw new Error(
      "Driveフォルダ名が空です。"
    );
  }

  const folders =
    parent.getFoldersByName(
      name
    );

  if (
    folders.hasNext()
  ) {
    return folders.next();
  }

  return parent.createFolder(
    name
  );
}

/**
 * ============================================================
 * 初回セットアップ
 * 店内見学アンケートPDF保存先Driveフォルダを作成・確認
 *
 * Apps Scriptエディタからこの関数を1回実行する。
 * 初回はGoogle Driveアクセス権限の承認が表示される。
 * ============================================================
 */
function setupTourQuestionnaireDrive() {

  const effectiveUser =
    String(
      Session
        .getEffectiveUser()
        .getEmail() || ""
    ).trim();

  const folder =
    getOrCreateTourPrintFolder_();

  const result = {
    ok: true,
    effective_user:
      effectiveUser,
    folder_name:
      TOUR_PRINT_DRIVE_FOLDER,
    folder_path:
      TOUR_PRINT_DRIVE_ROOT_FOLDER +
      " / " +
      TOUR_PRINT_DRIVE_FOLDER,
    folder_id:
      folder.getId(),
    folder_url:
      folder.getUrl()
  };

  Logger.log(
    "=== 店内見学アンケートDrive初期設定 完了 ==="
  );

  Logger.log(
    "実行アカウント: " +
    effectiveUser
  );

  Logger.log(
    "保存先: " +
    result.folder_path
  );

  Logger.log(
    "フォルダURL: " +
    result.folder_url
  );

  return result;
}

