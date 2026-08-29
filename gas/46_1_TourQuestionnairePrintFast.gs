const TOUR_FAST_PRINT_EXPORT_ID_PROPERTY = "TOUR_FAST_PRINT_EXPORT_SPREADSHEET_ID";
const TOUR_FAST_PRINT_EXPORT_VERSION_PROPERTY = "TOUR_FAST_PRINT_EXPORT_TEMPLATE_VERSION";
const TOUR_FAST_PRINT_EXPORT_TEMPLATE_VERSION = "20260829-fast-2p-v1";
const TOUR_FAST_PRINT_PAGE1_SHEET = "アンケート_1";
const TOUR_FAST_PRINT_PAGE2_SHEET = "アンケート_2";

function generateTourQuestionnairePdfFast(params) {
  const lock = LockService.getScriptLock();
  let page1 = null;

  try {
    lock.waitLock(10000);
    params = params || {};

    const reservationId = String(params.reservation_id || "").trim();
    const printMode = String(params.print_mode || "FULL").trim().toUpperCase();

    if (!reservationId) {
      return errorResponse("reservation_idを指定してください。", "VALIDATION_ERROR");
    }

    if (!["FULL", "ADDRESS_ONLY", "BLANK"].includes(printMode)) {
      return errorResponse("印刷モードが正しくありません。", "INVALID_PRINT_MODE", { print_mode: printMode });
    }

    const reservationInfo = findReservationRowById_(reservationId);
    if (!reservationInfo) {
      return errorResponse("指定された予約が見つかりません。", "RESERVATION_NOT_FOUND", { reservation_id: reservationId });
    }

    const reservation = reservationInfo.record || {};
    const serviceCode = String(reservation.service_code || "").trim().toUpperCase();
    const customerType = String(reservation.customer_type || "").trim().toUpperCase();
    const memberNo = String(reservation.member_no || "").trim();
    const isTour = serviceCode === "TOUR";
    const isCounselVisitor = serviceCode === "COUNSEL" && (
      customerType === "VISITOR" || (customerType !== "MEMBER" && !memberNo)
    );

    if (!isTour && !isCounselVisitor) {
      return errorResponse("この予約はアンケート作成対象ではありません。", "QUESTIONNAIRE_NOT_AVAILABLE", {
        service_code: serviceCode,
        customer_type: customerType
      });
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const templateSheet = spreadsheet.getSheetByName(TOUR_PRINT_TEMPLATE_SHEET);
    if (!templateSheet) {
      return errorResponse(
        "テンプレートシート「" + TOUR_PRINT_TEMPLATE_SHEET + "」が見つかりません。",
        "TOUR_TEMPLATE_NOT_FOUND"
      );
    }

    const exportSpreadsheet = getOrCreateTourFastPrintExportSpreadsheet_(templateSheet);
    page1 = exportSpreadsheet.getSheetByName(TOUR_FAST_PRINT_PAGE1_SHEET);
    const page2 = exportSpreadsheet.getSheetByName(TOUR_FAST_PRINT_PAGE2_SHEET);

    if (!page1 || !page2) {
      throw new Error("アンケートPDF用2ページテンプレートが壊れています。");
    }

    clearTourFastPrintVariableCells_(page1);

    const customerNameRaw = String(reservation.customer_name || "").trim();
    const customerName = customerNameRaw ? customerNameRaw + " さま" : "";
    const postalCode = formatTourPrintPostalCode_(
      reservation.postal_code || reservation.postal || reservation.zip_code ||
      reservation.zip || reservation.customer_postal_code
    );
    const address = buildTourPrintAddress_(reservation);
    const customerPhone = formatTourPrintPhone_(reservation.customer_phone);
    const customerEmail = String(reservation.customer_email || "").trim();
    const customerPhoneForPrint = customerPhone ? "　" + customerPhone : "";
    const customerEmailForPrint = customerEmail ? " " + customerEmail : "";
    const visitDateTime = formatTourPrintVisitDateTime_(reservation);

    if (printMode === "FULL") {
      page1.getRange("F3").setValue(customerName);
      page1.getRange("G4").setValue(postalCode);
      page1.getRange("F5").setValue(address);
      page1.getRange("F6").setNumberFormat("@").setValue(customerPhoneForPrint).setHorizontalAlignment("left");
      page1.getRange("F7").setValue(customerEmailForPrint).setHorizontalAlignment("left");
      page1.getRange("D39").setValue(visitDateTime);
    } else if (printMode === "ADDRESS_ONLY") {
      page1.getRange("G4").setValue(postalCode);
      page1.getRange("F5").setValue(address);
      page1.getRange("D39").setValue(visitDateTime);
    }

    SpreadsheetApp.flush();

    const response = UrlFetchApp.fetch(
      buildTourFastPrintExportUrl_(exportSpreadsheet.getId()),
      {
        method: "get",
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      }
    );

    const statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error("PDF生成に失敗しました。HTTP " + statusCode);
    }

    const pdfBlob = response.getBlob().setContentType("application/pdf");
    const fileName = buildTourPrintFileName_(reservation, printMode);
    pdfBlob.setName(fileName);

    const saveFolder = getOrCreateTourPrintFolder_();
    const pdfFile = saveFolder.createFile(pdfBlob);
    pdfFile.setName(fileName);

    const fileId = pdfFile.getId();
    const fileUrl = "https://drive.google.com/file/d/" + encodeURIComponent(fileId) + "/view";

    logInfo("generateTourQuestionnairePdf", "店内見学アンケートPDF高速生成・Drive保存成功", {
      reservation_id: reservationId,
      print_mode: printMode,
      filename: fileName,
      file_id: fileId,
      export_spreadsheet_id: exportSpreadsheet.getId(),
      pages: 2
    });

    return successResponse({
      reservation_id: reservationId,
      print_mode: printMode,
      filename: fileName,
      mime_type: "application/pdf",
      file_id: fileId,
      file_url: fileUrl,
      folder_url: saveFolder.getUrl(),
      drive_folder: TOUR_PRINT_DRIVE_ROOT_FOLDER + "/" + TOUR_PRINT_DRIVE_FOLDER,
      pages: 2,
      duplex: true,
      duplex_instruction: "両面印刷・長辺とじ"
    });
  } catch (error) {
    logError("generateTourQuestionnairePdf", error.message, { stack: error.stack });
    return errorResponse(
      error.message || "アンケートPDF生成中にエラーが発生しました。",
      "TOUR_PRINT_ERROR",
      { message: error.message }
    );
  } finally {
    if (page1) {
      try {
        clearTourFastPrintVariableCells_(page1);
        SpreadsheetApp.flush();
      } catch (ignore) {}
    }
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function getOrCreateTourFastPrintExportSpreadsheet_(templateSheet) {
  const properties = PropertiesService.getScriptProperties();
  const storedId = String(properties.getProperty(TOUR_FAST_PRINT_EXPORT_ID_PROPERTY) || "").trim();
  const storedVersion = String(properties.getProperty(TOUR_FAST_PRINT_EXPORT_VERSION_PROPERTY) || "").trim();

  if (storedId && storedVersion === TOUR_FAST_PRINT_EXPORT_TEMPLATE_VERSION) {
    try {
      const file = DriveApp.getFileById(storedId);
      if (!file.isTrashed()) {
        const spreadsheet = SpreadsheetApp.openById(storedId);
        if (isValidTourFastPrintExportSpreadsheet_(spreadsheet)) {
          return spreadsheet;
        }
      }
    } catch (ignore) {}
  }

  return rebuildTourFastPrintExportSpreadsheet_(templateSheet, storedId);
}

function rebuildTourFastPrintExportSpreadsheet_(templateSheet, previousId) {
  const properties = PropertiesService.getScriptProperties();
  let exportSpreadsheet = null;
  let exportFile = null;

  try {
    exportSpreadsheet = SpreadsheetApp.create(
      "_SYSTEM_TOUR_QUESTIONNAIRE_2P_" + TOUR_FAST_PRINT_EXPORT_TEMPLATE_VERSION
    );
    exportFile = DriveApp.getFileById(exportSpreadsheet.getId());

    const defaultSheet = exportSpreadsheet.getSheets()[0];
    const page1 = templateSheet.copyTo(exportSpreadsheet);
    page1.setName(TOUR_FAST_PRINT_PAGE1_SHEET);
    const page2 = templateSheet.copyTo(exportSpreadsheet);
    page2.setName(TOUR_FAST_PRINT_PAGE2_SHEET);
    exportSpreadsheet.deleteSheet(defaultSheet);

    if (page1.getMaxRows() > 41) {
      page1.deleteRows(42, page1.getMaxRows() - 41);
    }
    if (page2.getMaxRows() >= 41) {
      page2.deleteRows(1, 41);
    }

    [page1, page2].forEach(function(sheet) {
      if (sheet.getMaxColumns() > 32) {
        sheet.deleteColumns(33, sheet.getMaxColumns() - 32);
      }
    });

    clearTourFastPrintVariableCells_(page1);
    SpreadsheetApp.flush();

    if (!isValidTourFastPrintExportSpreadsheet_(exportSpreadsheet)) {
      throw new Error("2ページPDFテンプレートの作成に失敗しました。");
    }

    properties.setProperty(TOUR_FAST_PRINT_EXPORT_ID_PROPERTY, exportSpreadsheet.getId());
    properties.setProperty(TOUR_FAST_PRINT_EXPORT_VERSION_PROPERTY, TOUR_FAST_PRINT_EXPORT_TEMPLATE_VERSION);

    if (previousId && previousId !== exportSpreadsheet.getId()) {
      try {
        DriveApp.getFileById(previousId).setTrashed(true);
      } catch (ignore) {}
    }

    return exportSpreadsheet;
  } catch (error) {
    if (exportFile) {
      try {
        exportFile.setTrashed(true);
      } catch (ignore) {}
    }
    properties.deleteProperty(TOUR_FAST_PRINT_EXPORT_ID_PROPERTY);
    properties.deleteProperty(TOUR_FAST_PRINT_EXPORT_VERSION_PROPERTY);
    throw error;
  }
}

function isValidTourFastPrintExportSpreadsheet_(spreadsheet) {
  if (!spreadsheet) return false;
  const sheets = spreadsheet.getSheets();
  if (sheets.length !== 2) return false;

  const page1 = spreadsheet.getSheetByName(TOUR_FAST_PRINT_PAGE1_SHEET);
  const page2 = spreadsheet.getSheetByName(TOUR_FAST_PRINT_PAGE2_SHEET);

  return !!(
    page1 && page2 &&
    page1.getMaxRows() === 41 && page2.getMaxRows() === 27 &&
    page1.getMaxColumns() === 32 && page2.getMaxColumns() === 32
  );
}

function clearTourFastPrintVariableCells_(page1) {
  page1.getRangeList(["F3", "G4", "F5", "F6", "F7", "D39"]).clearContent();
}

function buildTourFastPrintExportUrl_(spreadsheetId) {
  return (
    "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(spreadsheetId) + "/export" +
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
    "&right_margin=0.709"
  );
}

function setupTourQuestionnaireFastPdf() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const templateSheet = spreadsheet.getSheetByName(TOUR_PRINT_TEMPLATE_SHEET);
    if (!templateSheet) {
      throw new Error("テンプレートシート「" + TOUR_PRINT_TEMPLATE_SHEET + "」が見つかりません。");
    }

    const properties = PropertiesService.getScriptProperties();
    const previousId = String(properties.getProperty(TOUR_FAST_PRINT_EXPORT_ID_PROPERTY) || "").trim();
    const exportSpreadsheet = rebuildTourFastPrintExportSpreadsheet_(templateSheet, previousId);

    return {
      ok: true,
      spreadsheet_id: exportSpreadsheet.getId(),
      sheet_names: exportSpreadsheet.getSheets().map(function(sheet) { return sheet.getName(); }),
      pages: 2
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}
