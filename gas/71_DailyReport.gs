/**
 * A-nauts OS Reserve
 * 業務日報の共有保存・過去閲覧・入力者記録・管理メール送信・設備添付保存
 */

const DAILY_REPORT_SHEET_NAME = "daily_reports";
const DAILY_REPORT_IMAGE_FOLDER_PROPERTY = "DAILY_REPORT_IMAGE_FOLDER_ID";
const DAILY_REPORT_IMAGE_FOLDER_NAME = "A-nauts OS Daily Report Images";
const DAILY_REPORT_ADMIN_EMAILS = [
  "info@theforestgym.com",
  "kawakamimihomiho@gmail.com"
];
const DAILY_REPORT_MAX_ATTACHMENTS = 5;
const DAILY_REPORT_MAX_IMAGE_BYTES = 900 * 1024;
const DAILY_REPORT_MAX_VIDEO_BYTES = 8 * 1024 * 1024;
const DAILY_REPORT_MAX_TOTAL_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const DAILY_REPORT_MAX_VIDEOS = 1;
const DAILY_REPORT_MAX_SERIAL_IMAGES = 1;
const DAILY_REPORT_MAX_JSON_LENGTH = 45000;
const DAILY_REPORT_HEADERS = [
  "report_key",
  "store_code",
  "report_date",
  "status",
  "version",
  "staff_codes",
  "staff_names",
  "report_json",
  "images_json",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "submitted_at",
  "submitted_by",
  "emailed_at",
  "email_recipients"
];


function getDailyReport(params, auth) {
  params = params || {};
  auth = auth || requireAuth_(params, ["ADMIN", "MANAGER", "STAFF"]);

  const identity = normalizeDailyReportIdentity_(params);
  const sheet = getDailyReportSheet_();
  const found = findDailyReportRow_(sheet, identity.key);

  return successResponse({
    store_code: identity.storeCode,
    date: identity.date,
    report: found ? buildDailyReportResponse_(found) : null,
    viewer_staff_code: String(auth.staff_code || "")
  });
}


function saveDailyReport(body, auth) {
  return writeDailyReport_(body, auth, false);
}


function submitDailyReport(body, auth) {
  return writeDailyReport_(body, auth, true);
}


function writeDailyReport_(body, auth, shouldSubmit) {
  body = body || {};
  auth = auth || requireAuth_(body, ["ADMIN", "MANAGER", "STAFF"]);

  const identity = normalizeDailyReportIdentity_(body);
  const incomingReport = normalizeDailyReportPayload_(body.report);
  const expectedVersion = normalizeDailyReportVersion_(body.version);
  const requestedExistingIds = normalizeDailyReportIdList_(body.existing_image_ids);
  const incomingImages = normalizeDailyReportIncomingImages_(body.images);
  const newFiles = [];
  let savedRecord = null;
  let removedImages = [];

  precheckDailyReportWrite_(identity.key, expectedVersion, shouldSubmit);

  try {
    const uploaded = uploadDailyReportImages_(identity, incomingImages);
    uploaded.forEach(function (image) {
      newFiles.push(image);
    });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);

    try {
      const sheet = getDailyReportSheet_();
      const found = findDailyReportRow_(sheet, identity.key);
      assertDailyReportWritable_(found, expectedVersion, shouldSubmit);

      const currentImages = found
        ? parseDailyReportImages_(found.row[found.header.images_json])
        : [];
      const currentReport = found
        ? parseDailyReportJson_(found.row[found.header.report_json], {})
        : {};
      const retainedImages = retainDailyReportImages_(
        currentImages,
        requestedExistingIds,
        body.existing_image_ids !== undefined
      );

      removedImages = currentImages.filter(function (image) {
        return !retainedImages.some(function (retained) {
          return retained.file_id === image.file_id;
        });
      });

      const images = retainedImages.concat(newFiles.map(function (entry) {
        return entry.meta;
      }));
      validateDailyReportAttachments_(images);

      const currentVersion = found ? Number(found.row[found.header.version] || 0) : 0;
      const nextVersion = currentVersion + 1;
      const now = new Date();
      const actorCode = String(auth.staff_code || "").trim();
      const attachmentsChanged = currentImages.map(function (image) {
        return String(image.file_id || "");
      }).join("|") !== images.map(function (image) {
        return String(image.file_id || "");
      }).join("|");
      const report = applyDailyReportAttribution_(
        incomingReport,
        currentReport,
        auth,
        now,
        attachmentsChanged
      );
      if (JSON.stringify(report).length > DAILY_REPORT_MAX_JSON_LENGTH) {
        throw new Error("日報の入力内容が長すぎます。");
      }
      const row = found
        ? found.row.slice()
        : new Array(Math.max(sheet.getLastColumn(), DAILY_REPORT_HEADERS.length)).fill("");
      const header = found ? found.header : makeDailyReportHeaderMap_(DAILY_REPORT_HEADERS);
      const staff = Array.isArray(report.staff) ? report.staff : [];

      setDailyReportCell_(row, header, "report_key", identity.key);
      setDailyReportCell_(row, header, "store_code", identity.storeCode);
      setDailyReportCell_(row, header, "report_date", identity.date);
      setDailyReportCell_(row, header, "status", shouldSubmit ? "SUBMITTING" : "DRAFT");
      setDailyReportCell_(row, header, "version", nextVersion);
      setDailyReportCell_(row, header, "staff_codes", staff.map(function (item) {
        return item.staff_code;
      }).join(","));
      setDailyReportCell_(row, header, "staff_names", staff.map(function (item) {
        return item.staff_name;
      }).join("、"));
      setDailyReportCell_(row, header, "report_json", JSON.stringify(report));
      setDailyReportCell_(row, header, "images_json", JSON.stringify(images));

      if (!found) {
        setDailyReportCell_(row, header, "created_at", now);
        setDailyReportCell_(row, header, "created_by", actorCode);
      }

      setDailyReportCell_(row, header, "updated_at", now);
      setDailyReportCell_(row, header, "updated_by", actorCode);

      if (!shouldSubmit) {
        setDailyReportCell_(row, header, "submitted_at", "");
        setDailyReportCell_(row, header, "submitted_by", "");
        setDailyReportCell_(row, header, "emailed_at", "");
        setDailyReportCell_(row, header, "email_recipients", "");
      }

      const rowNumber = found ? found.rowNumber : sheet.getLastRow() + 1;
      writeDailyReportRow_(sheet, rowNumber, row);
      SpreadsheetApp.flush();

      savedRecord = buildDailyReportResponse_({
        rowNumber: rowNumber,
        row: row,
        header: header
      });

    } finally {
      lock.releaseLock();
    }

    trashDailyReportImages_(removedImages);

    if (!shouldSubmit) {
      return successResponse({
        report: savedRecord,
        message: "業務日報を下書き保存しました。"
      });
    }

    try {
      sendDailyReportEmail_(savedRecord);
      savedRecord = finalizeDailyReportSubmission_(
        identity.key,
        savedRecord.version,
        auth
      );
    } catch (mailError) {
      rollbackDailyReportSubmission_(identity.key, savedRecord.version);
      throw new Error(
        "日報は下書き保存しましたが、管理メールを送信できませんでした。" +
        String(mailError && mailError.message ? " " + mailError.message : "")
      );
    }

    return successResponse({
      report: savedRecord,
      message: "業務日報を提出し、管理メールへ送信しました。"
    });

  } catch (error) {
    if (!savedRecord) {
      trashDailyReportImages_(newFiles.map(function (entry) {
        return entry.meta;
      }));
    }
    throw error;
  }
}


function precheckDailyReportWrite_(reportKey, expectedVersion, shouldSubmit) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getDailyReportSheet_();
    const found = findDailyReportRow_(sheet, reportKey);
    assertDailyReportWritable_(found, expectedVersion, shouldSubmit);
  } finally {
    lock.releaseLock();
  }
}


function assertDailyReportWritable_(found, expectedVersion, shouldSubmit) {
  if (!found) {
    if (expectedVersion !== 0) {
      throw new Error("日報が更新されています。再読込してください。");
    }
    return;
  }

  const currentStatus = String(found.row[found.header.status] || "DRAFT").toUpperCase();
  const currentVersion = Number(found.row[found.header.version] || 0);

  if (currentStatus === "SUBMITTING") {
    throw new Error("別のスタッフが日報を送信中です。少し待って再読込してください。");
  }
  if (currentStatus === "SUBMITTED") {
    if (shouldSubmit) {
      throw new Error("この日報は提出済みです。管理メールは再送していません。");
    }
    throw new Error("提出済みの日報は変更できません。");
  }
  if (currentVersion !== expectedVersion) {
    throw new Error("別のスタッフが日報を更新しました。再読込してください。");
  }
}


function finalizeDailyReportSubmission_(reportKey, version, auth) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getDailyReportSheet_();
    const found = findDailyReportRow_(sheet, reportKey);
    if (!found || Number(found.row[found.header.version] || 0) !== Number(version)) {
      throw new Error("提出状態を確定できませんでした。");
    }

    const now = new Date();
    const actorCode = String(auth && auth.staff_code || "").trim();
    setDailyReportCell_(found.row, found.header, "status", "SUBMITTED");
    setDailyReportCell_(found.row, found.header, "submitted_at", now);
    setDailyReportCell_(found.row, found.header, "submitted_by", actorCode);
    setDailyReportCell_(found.row, found.header, "emailed_at", now);
    setDailyReportCell_(
      found.row,
      found.header,
      "email_recipients",
      DAILY_REPORT_ADMIN_EMAILS.join(",")
    );
    writeDailyReportRow_(sheet, found.rowNumber, found.row);
    SpreadsheetApp.flush();
    return buildDailyReportResponse_(found);
  } finally {
    lock.releaseLock();
  }
}


function rollbackDailyReportSubmission_(reportKey, version) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getDailyReportSheet_();
    const found = findDailyReportRow_(sheet, reportKey);
    if (!found || Number(found.row[found.header.version] || 0) !== Number(version)) return;
    if (String(found.row[found.header.status] || "").toUpperCase() !== "SUBMITTING") return;
    setDailyReportCell_(found.row, found.header, "status", "DRAFT");
    writeDailyReportRow_(sheet, found.rowNumber, found.row);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}


function normalizeDailyReportIdentity_(value) {
  const storeCode = String(value && value.store_code || "YACHIYO").trim().toUpperCase();
  const date = String(value && (value.date || value.report_date) || "").trim();

  if (!/^[A-Z0-9_-]{1,30}$/.test(storeCode)) {
    throw new Error("店舗コードが正しくありません。");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("日報の日付が正しくありません。");
  }

  const parts = date.split("-").map(Number);
  const parsed = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  if (
    parsed.getFullYear() !== parts[0] ||
    parsed.getMonth() !== parts[1] - 1 ||
    parsed.getDate() !== parts[2]
  ) {
    throw new Error("日報の日付が正しくありません。");
  }

  return {
    storeCode: storeCode,
    date: date,
    key: storeCode + "|" + date
  };
}


function normalizeDailyReportPayload_(value) {
  const report = value && typeof value === "object"
    ? JSON.parse(JSON.stringify(value))
    : {};
  delete report.staff;
  delete report.contributors;
  delete report.cleaning_memo_meta;
  delete report.other_meta;
  delete report.reporter;
  delete report.reporter_code;

  report.cleaning = (Array.isArray(report.cleaning) ? report.cleaning : []).map(function (item) {
    return {
      area: String(item && item.area || "").trim(),
      group: String(item && item.group || "").trim(),
      item: String(item && item.item || "").trim(),
      instruction: String(item && item.instruction || "").trim(),
      status: ["DONE", "NOT_DONE", "NA"].includes(String(item && item.status || "").toUpperCase())
        ? String(item.status).toUpperCase()
        : ""
    };
  });

  report.inquiries = (Array.isArray(report.inquiries) ? report.inquiries : []).map(function (item) {
    return {
      inquiry_id: String(item && item.inquiry_id || "").trim(),
      channel: String(item && item.channel || "").trim(),
      time: String(item && item.time || "").trim(),
      name: String(item && item.name || "").trim(),
      member_no: String(item && item.member_no || "").trim(),
      status: String(item && item.status || "").trim(),
      category: String(item && item.category || "").trim(),
      detail: String(item && item.detail || "").trim()
    };
  });

  report.equipment = normalizeDailyReportSection_(report.equipment, [
    "has_issue", "category", "memo"
  ]);
  report.trouble = normalizeDailyReportSection_(report.trouble, [
    "has_issue", "category", "status", "memo"
  ]);
  report.handover = normalizeDailyReportSection_(report.handover, [
    "memo", "needs_action"
  ]);
  report.cleaning_memo = String(report.cleaning_memo || "").trim();
  report.other_memo = String(report.other_memo || "").trim();
  const reservationCount = Number(report.reservation_count || 0);
  report.reservation_count = Number.isFinite(reservationCount)
    ? Math.max(0, Math.floor(reservationCount))
    : 0;

  const json = JSON.stringify(report);
  if (json.length > DAILY_REPORT_MAX_JSON_LENGTH) {
    throw new Error("日報の入力内容が長すぎます。");
  }
  return report;
}


function normalizeDailyReportSection_(value, keys) {
  const source = value && typeof value === "object" ? value : {};
  const result = {};
  (keys || []).forEach(function (key) {
    if (key === "has_issue" || key === "needs_action") {
      result[key] = source[key] === true;
    } else {
      result[key] = String(source[key] || "").trim();
    }
  });
  return result;
}


function applyDailyReportAttribution_(incoming, current, auth, now, attachmentsChanged) {
  const report = JSON.parse(JSON.stringify(incoming || {}));
  const previous = current && typeof current === "object" ? current : {};
  const actor = getDailyReportActor_(auth);
  const timestamp = formatDailyReportTimestamp_(now);

  report.reporter_code = actor.staff_code;
  report.reporter = actor.staff_name;
  report.contributors = mergeDailyReportContributors_(previous, actor, timestamp);
  report.staff = report.contributors.map(function (item) {
    return { staff_code: item.staff_code, staff_name: item.staff_name };
  });

  const previousCleaning = {};
  (Array.isArray(previous.cleaning) ? previous.cleaning : []).forEach(function (item) {
    previousCleaning[dailyReportCleaningKey_(item)] = item || {};
  });
  report.cleaning = (Array.isArray(report.cleaning) ? report.cleaning : []).map(function (item) {
    const saved = previousCleaning[dailyReportCleaningKey_(item)] || {};
    const result = {
      area: item.area,
      group: item.group,
      item: item.item,
      instruction: item.instruction,
      status: item.status
    };
    copyDailyReportAttribution_(result, saved, "updated");
    copyDailyReportAttribution_(result, saved, "completed");

    if (String(item.status || "") !== String(saved.status || "")) {
      stampDailyReportAttribution_(result, actor, timestamp, "updated");
      if (item.status === "DONE") {
        stampDailyReportAttribution_(result, actor, timestamp, "completed");
      } else {
        clearDailyReportAttribution_(result, "completed");
      }
    } else if (item.status === "DONE" && !result.completed_by_code) {
      stampDailyReportAttribution_(result, actor, timestamp, "completed");
    } else if (item.status && !result.updated_by_code) {
      stampDailyReportAttribution_(result, actor, timestamp, "updated");
    }
    return result;
  });

  report.cleaning_memo_meta = attributeDailyReportText_(
    report.cleaning_memo,
    previous.cleaning_memo,
    previous.cleaning_memo_meta,
    actor,
    timestamp
  );
  report.inquiries = attributeDailyReportInquiries_(
    report.inquiries,
    previous.inquiries,
    actor,
    timestamp
  );
  report.equipment = attributeDailyReportSection_(
    report.equipment,
    previous.equipment,
    actor,
    timestamp,
    !!attachmentsChanged
  );
  report.trouble = attributeDailyReportSection_(
    report.trouble,
    previous.trouble,
    actor,
    timestamp,
    false
  );
  report.handover = attributeDailyReportSection_(
    report.handover,
    previous.handover,
    actor,
    timestamp,
    false
  );
  report.other_meta = attributeDailyReportText_(
    report.other_memo,
    previous.other_memo,
    previous.other_meta,
    actor,
    timestamp
  );
  return report;
}


function getDailyReportActor_(auth) {
  const profile = auth && auth.profile || {};
  const code = String(auth && auth.staff_code || profile.staff_code || "").trim().toUpperCase();
  const name = String(profile.display_name || profile.staff_name || code).trim() || code;
  return { staff_code: code, staff_name: name };
}


function mergeDailyReportContributors_(previous, actor, timestamp) {
  const source = Array.isArray(previous && previous.contributors)
    ? previous.contributors
    : (Array.isArray(previous && previous.staff) ? previous.staff : []);
  const result = [];
  const seen = {};
  source.forEach(function (item) {
    const code = String(item && item.staff_code || "").trim().toUpperCase();
    if (!code || seen[code]) return;
    seen[code] = true;
    result.push({
      staff_code: code,
      staff_name: String(item && item.staff_name || code).trim() || code,
      first_saved_at: String(item && item.first_saved_at || ""),
      last_saved_at: String(item && item.last_saved_at || "")
    });
  });

  let own = null;
  result.forEach(function (item) {
    if (item.staff_code === actor.staff_code) own = item;
  });
  if (!own) {
    own = {
      staff_code: actor.staff_code,
      staff_name: actor.staff_name,
      first_saved_at: timestamp,
      last_saved_at: timestamp
    };
    result.push(own);
  } else {
    own.staff_name = actor.staff_name;
    own.first_saved_at = own.first_saved_at || timestamp;
    own.last_saved_at = timestamp;
  }
  if (result.length > 10) throw new Error("日報の記録者が多すぎます。");
  return result;
}


function dailyReportCleaningKey_(item) {
  return [item && item.area, item && item.group, item && item.item].map(function (value) {
    return String(value || "");
  }).join("|");
}


function copyDailyReportAttribution_(target, source, prefix) {
  ["by_code", "by_name", "at"].forEach(function (suffix) {
    const key = prefix + "_" + suffix;
    if (source && source[key]) target[key] = String(source[key]);
  });
}


function clearDailyReportAttribution_(target, prefix) {
  ["by_code", "by_name", "at"].forEach(function (suffix) {
    delete target[prefix + "_" + suffix];
  });
}


function stampDailyReportAttribution_(target, actor, timestamp, prefix) {
  target[prefix + "_by_code"] = actor.staff_code;
  target[prefix + "_by_name"] = actor.staff_name;
  target[prefix + "_at"] = timestamp;
}


function attributeDailyReportText_(value, previousValue, previousMeta, actor, timestamp) {
  const result = {};
  copyDailyReportAttribution_(result, previousMeta || {}, "updated");
  if (String(value || "") !== String(previousValue || "")) {
    stampDailyReportAttribution_(result, actor, timestamp, "updated");
  }
  return result;
}


function dailyReportSectionCore_(value) {
  const result = {};
  Object.keys(value && typeof value === "object" ? value : {}).sort().forEach(function (key) {
    if (!/^updated_/.test(key) && !/^completed_/.test(key) && !/^received_/.test(key)) {
      result[key] = value[key];
    }
  });
  return result;
}


function attributeDailyReportSection_(value, previousValue, actor, timestamp, forceChanged) {
  const result = dailyReportSectionCore_(value);
  copyDailyReportAttribution_(result, previousValue || {}, "updated");
  const changed = JSON.stringify(dailyReportSectionCore_(value)) !==
    JSON.stringify(dailyReportSectionCore_(previousValue));
  if (changed || forceChanged) stampDailyReportAttribution_(result, actor, timestamp, "updated");
  return result;
}


function attributeDailyReportInquiries_(incoming, previousValue, actor, timestamp) {
  const previous = Array.isArray(previousValue) ? previousValue : [];
  const byId = {};
  previous.forEach(function (item) {
    const id = String(item && item.inquiry_id || "").trim();
    if (id && !byId[id]) byId[id] = item;
  });
  const used = {};

  return (Array.isArray(incoming) ? incoming : []).map(function (item, index) {
    let id = String(item && item.inquiry_id || "").trim();
    let saved = id && byId[id] ? byId[id] : (!id ? (previous[index] || null) : null);
    if (!id || used[id]) id = Utilities.getUuid();
    used[id] = true;

    const result = {
      inquiry_id: id,
      channel: String(item && item.channel || ""),
      time: String(item && item.time || ""),
      name: String(item && item.name || ""),
      member_no: String(item && item.member_no || ""),
      status: String(item && item.status || ""),
      category: String(item && item.category || ""),
      detail: String(item && item.detail || "")
    };
    if (saved) {
      copyDailyReportAttribution_(result, saved, "received");
      copyDailyReportAttribution_(result, saved, "updated");
      const changed = JSON.stringify(dailyReportInquiryCore_(result)) !==
        JSON.stringify(dailyReportInquiryCore_(saved));
      if (changed) stampDailyReportAttribution_(result, actor, timestamp, "updated");
    }
    if (!result.received_by_code) stampDailyReportAttribution_(result, actor, timestamp, "received");
    return result;
  });
}


function dailyReportInquiryCore_(item) {
  return {
    channel: String(item && item.channel || ""),
    time: String(item && item.time || ""),
    name: String(item && item.name || ""),
    member_no: String(item && item.member_no || ""),
    status: String(item && item.status || ""),
    category: String(item && item.category || ""),
    detail: String(item && item.detail || "")
  };
}


function normalizeDailyReportVersion_(value) {
  const version = Number(value || 0);
  if (!Number.isFinite(version) || version < 0 || Math.floor(version) !== version) {
    throw new Error("日報のバージョンが正しくありません。");
  }
  return version;
}


function normalizeDailyReportIdList_(value) {
  if (!Array.isArray(value)) return [];
  const seen = {};
  return value.map(function (id) {
    return String(id || "").trim();
  }).filter(function (id) {
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  });
}


function normalizeDailyReportIncomingImages_(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > DAILY_REPORT_MAX_ATTACHMENTS) {
    throw new Error("設備・施設異常の添付は最大5件です。");
  }

  let totalBytes = 0;
  const normalized = value.map(function (image, index) {
    const mimeType = String(image && image.mime_type || "image/jpeg").trim().toLowerCase();
    const base64 = String(image && image.data_base64 || "").replace(/^data:[^;]+;base64,/, "").trim();
    const fileName = String(image && image.file_name || ("equipment-" + (index + 1) + ".jpg")).trim();
    const mediaKind = mimeType.indexOf("video/") === 0 ? "VIDEO" : "IMAGE";
    const attachmentType = String(image && image.attachment_type || "ISSUE_MEDIA").toUpperCase() === "SERIAL"
      ? "SERIAL"
      : "ISSUE_MEDIA";

    if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"].includes(mimeType)) {
      throw new Error("添付できるのはJPEG・PNG・WebP画像、MP4・MOV・WebM動画です。");
    }
    if (!base64) {
      throw new Error("添付データが空です。");
    }
    if (attachmentType === "SERIAL" && mediaKind !== "IMAGE") {
      throw new Error("シリアルナンバーには画像を添付してください。");
    }

    const estimatedBytes = Math.floor(base64.length * 3 / 4);
    if (mediaKind === "IMAGE" && estimatedBytes > DAILY_REPORT_MAX_IMAGE_BYTES) {
      throw new Error("画像1枚の上限は900KBです。");
    }
    if (mediaKind === "VIDEO" && estimatedBytes > DAILY_REPORT_MAX_VIDEO_BYTES) {
      throw new Error("動画1本の上限は8MBです。");
    }
    totalBytes += estimatedBytes;

    return {
      mimeType: mimeType,
      base64: base64,
      fileName: fileName,
      mediaKind: mediaKind,
      attachmentType: attachmentType,
      estimatedBytes: estimatedBytes
    };
  });

  if (totalBytes > DAILY_REPORT_MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error("添付合計の上限は12MBです。");
  }
  return normalized;
}


function validateDailyReportAttachments_(attachments) {
  const items = Array.isArray(attachments) ? attachments : [];
  if (items.length > DAILY_REPORT_MAX_ATTACHMENTS) {
    throw new Error("設備・施設異常の添付は最大5件です。");
  }

  let totalBytes = 0;
  let videoCount = 0;
  let serialCount = 0;
  items.forEach(function (item) {
    const mimeType = String(item && item.mime_type || "").toLowerCase();
    const mediaKind = String(item && item.media_kind || (mimeType.indexOf("video/") === 0 ? "VIDEO" : "IMAGE")).toUpperCase();
    const attachmentType = String(item && item.attachment_type || "ISSUE_MEDIA").toUpperCase();
    const bytes = Math.max(0, Number(item && item.size_bytes || 0));
    totalBytes += bytes;
    if (mediaKind === "VIDEO") videoCount += 1;
    if (attachmentType === "SERIAL") {
      serialCount += 1;
      if (mediaKind !== "IMAGE") throw new Error("シリアルナンバーには画像を添付してください。");
    }
  });
  if (videoCount > DAILY_REPORT_MAX_VIDEOS) throw new Error("動画は1本までです。");
  if (serialCount > DAILY_REPORT_MAX_SERIAL_IMAGES) throw new Error("シリアルナンバー画像は1枚までです。");
  if (totalBytes > DAILY_REPORT_MAX_TOTAL_ATTACHMENT_BYTES) throw new Error("添付合計の上限は12MBです。");
}


function uploadDailyReportImages_(identity, images) {
  if (!images.length) return [];
  const folder = getDailyReportImageFolder_();

  return images.map(function (image, index) {
    const bytes = Utilities.base64Decode(image.base64);
    if (image.mediaKind === "IMAGE" && bytes.length > DAILY_REPORT_MAX_IMAGE_BYTES) {
      throw new Error("画像1枚の上限は900KBです。");
    }
    if (image.mediaKind === "VIDEO" && bytes.length > DAILY_REPORT_MAX_VIDEO_BYTES) {
      throw new Error("動画1本の上限は8MBです。");
    }

    const extensionMap = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "video/mp4": ".mp4",
      "video/quicktime": ".mov",
      "video/webm": ".webm"
    };
    const extension = extensionMap[image.mimeType] || "";
    const safeName = identity.date + "_" + identity.storeCode + "_daily-report_" +
      (index + 1) + "_" + Date.now() + extension;
    const blob = Utilities.newBlob(bytes, image.mimeType, safeName);
    const file = folder.createFile(blob);

    return {
      file: file,
      meta: {
        file_id: file.getId(),
        file_name: safeName,
        original_name: image.fileName,
        mime_type: image.mimeType,
        size_bytes: bytes.length,
        url: file.getUrl(),
        media_kind: image.mediaKind,
        attachment_type: image.attachmentType
      }
    };
  });
}


function getDailyReportImageFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = String(properties.getProperty(DAILY_REPORT_IMAGE_FOLDER_PROPERTY) || "").trim();

  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (_) {
      properties.deleteProperty(DAILY_REPORT_IMAGE_FOLDER_PROPERTY);
    }
  }

  const folders = DriveApp.getFoldersByName(DAILY_REPORT_IMAGE_FOLDER_NAME);
  const folder = folders.hasNext()
    ? folders.next()
    : DriveApp.createFolder(DAILY_REPORT_IMAGE_FOLDER_NAME);
  properties.setProperty(DAILY_REPORT_IMAGE_FOLDER_PROPERTY, folder.getId());
  return folder;
}


function retainDailyReportImages_(currentImages, requestedIds, wasProvided) {
  if (!wasProvided) return currentImages.slice();
  return currentImages.filter(function (image) {
    return requestedIds.includes(String(image.file_id || ""));
  });
}


function trashDailyReportImages_(images) {
  (images || []).forEach(function (image) {
    const fileId = String(image && (image.file_id || (image.meta && image.meta.file_id)) || "").trim();
    if (!fileId) return;
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (_) {
      // 日報本体の保存結果を優先する。
    }
  });
}


function sendDailyReportEmail_(record) {
  const report = record.report || {};
  const images = Array.isArray(record.images) ? record.images : [];
  const attachments = [];

  images.forEach(function (image) {
    try {
      attachments.push(
        DriveApp.getFileById(image.file_id).getBlob().setName(
          image.original_name || image.file_name || "設備異常.jpg"
        )
      );
    } catch (_) {
      // 取得できない添付があっても本文と他の添付は送信する。
    }
  });

  MailApp.sendEmail({
    to: DAILY_REPORT_ADMIN_EMAILS.join(","),
    subject: "【A-nauts OS】業務日報 " + formatDailyReportDate_(record.date),
    body: buildDailyReportEmailBody_(record),
    name: "A-nauts OS Reserve",
    attachments: attachments
  });
}


function buildDailyReportEmailBody_(record) {
  const report = record.report || {};
  const cleaning = Array.isArray(report.cleaning) ? report.cleaning : [];
  const inquiries = Array.isArray(report.inquiries) ? report.inquiries : [];
  const staff = Array.isArray(report.contributors)
    ? report.contributors
    : (Array.isArray(report.staff) ? report.staff : []);
  const equipment = report.equipment || {};
  const trouble = report.trouble || {};
  const handover = report.handover || {};
  const images = Array.isArray(record.images) ? record.images : [];
  const cleaningDone = cleaning.filter(function (item) {
    return item.status === "DONE";
  }).length;
  const cleaningNotDone = cleaning.filter(function (item) {
    return item.status === "NOT_DONE";
  });
  const cleaningUnchecked = cleaning.filter(function (item) {
    return !item.status;
  });
  const lines = [
    "業務日報",
    "",
    "日付：" + formatDailyReportDate_(record.date),
    "店舗：" + String(record.store_code || ""),
    "入力者：" + (staff.map(function (item) {
      return item.staff_name || item.staff_code;
    }).join("、") || String(report.reporter || "未記録")),
    "予約実績：" + Number(report.reservation_count || 0) + "件",
    "",
    "【清掃】",
    "完了 " + cleaningDone + "件／未完了 " + cleaningNotDone.length +
      "件／未確認 " + cleaningUnchecked.length + "件"
  ];

  cleaningNotDone.forEach(function (item) {
    lines.push("・未完了：" + [item.area, item.group, item.item].filter(Boolean).join("／"));
  });
  if (report.cleaning_memo) lines.push("清掃メモ：" + report.cleaning_memo);

  lines.push("", "【問い合わせ・対応】", inquiries.length + "件");
  inquiries.forEach(function (item, index) {
    lines.push(
      (index + 1) + ". " + [item.time, item.channel, item.name, item.status].filter(Boolean).join("／")
    );
    if (item.received_by_name || item.received_by_code) {
      lines.push("   受付：" + (item.received_by_name || item.received_by_code));
    }
    if (item.detail) lines.push("   " + item.detail);
  });

  lines.push(
    "",
    "【設備・施設異常】",
    equipment.has_issue ? "異常あり" : "異常なし"
  );
  if (equipment.has_issue) {
    if (equipment.category) lines.push("対象：" + equipment.category);
    if (equipment.memo) lines.push("内容：" + equipment.memo);
  }

  lines.push("添付：" + images.length + "件");
  images.forEach(function (image, index) {
    const kind = image.media_kind === "VIDEO" ? "動画" : "画像";
    const purpose = image.attachment_type === "SERIAL" ? "シリアル" : "不具合箇所";
    lines.push((index + 1) + ". " + purpose + "・" + kind + " " + (image.url || image.file_name || "添付"));
  });

  lines.push(
    "",
    "【クレーム・事故・トラブル】",
    trouble.has_issue ? "あり" : "なし"
  );
  if (trouble.has_issue) {
    if (trouble.category) lines.push("区分：" + trouble.category);
    if (trouble.status) lines.push("対応：" + trouble.status);
    if (trouble.memo) lines.push("内容：" + trouble.memo);
  }

  lines.push(
    "",
    "【引継ぎ事項】",
    handover.memo || "なし",
    "次のスタッフによる対応：" + (handover.needs_action ? "必要" : "不要（共有のみ）")
  );
  if (report.other_memo) lines.push("", "【その他メモ】", report.other_memo);

  lines.push("", "A-nauts OS Reserve");
  return lines.join("\n");
}


function getDailyReportSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DAILY_REPORT_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(DAILY_REPORT_SHEET_NAME);
    sheet.getRange(1, 1, 1, DAILY_REPORT_HEADERS.length).setValues([DAILY_REPORT_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, DAILY_REPORT_HEADERS.length).setFontWeight("bold");
    sheet.setColumnWidth(1, 190);
    sheet.setColumnWidth(3, 110);
    sheet.setColumnWidth(8, 420);
    sheet.setColumnWidth(9, 320);
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(String);
  const currentMap = makeDailyReportHeaderMap_(currentHeaders);
  const missing = DAILY_REPORT_HEADERS.filter(function (header) {
    return currentMap[header] === undefined;
  });

  if (missing.length) {
    const startColumn = currentHeaders.length + 1;
    sheet.getRange(1, startColumn, 1, missing.length).setValues([missing]);
  }
  return sheet;
}


function findDailyReportRow_(sheet, reportKey) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) return null;

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const header = makeDailyReportHeaderMap_(headers);
  if (header.report_key === undefined) {
    throw new Error("daily_reportsシートの見出しが正しくありません。");
  }

  const match = sheet
    .getRange(2, header.report_key + 1, lastRow - 1, 1)
    .createTextFinder(reportKey)
    .matchEntireCell(true)
    .findNext();
  if (!match) return null;

  const rowNumber = match.getRow();
  return {
    rowNumber: rowNumber,
    row: sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0],
    header: header
  };
}


function writeDailyReportRow_(sheet, rowNumber, row) {
  const width = Math.max(sheet.getLastColumn(), DAILY_REPORT_HEADERS.length);
  const values = row.slice(0, width);
  while (values.length < width) values.push("");
  sheet.getRange(rowNumber, 1, 1, width).setValues([values]);
}


function makeDailyReportHeaderMap_(headers) {
  const map = {};
  (headers || []).forEach(function (header, index) {
    const key = String(header || "").trim();
    if (key) map[key] = index;
  });
  return map;
}


function setDailyReportCell_(row, header, key, value) {
  if (header[key] === undefined) {
    throw new Error("daily_reportsシートに " + key + " 列がありません。");
  }
  row[header[key]] = value;
}


function buildDailyReportResponse_(found) {
  const row = found.row;
  const header = found.header;
  return {
    report_key: String(row[header.report_key] || ""),
    store_code: String(row[header.store_code] || ""),
    date: String(row[header.report_date] || ""),
    status: String(row[header.status] || "DRAFT").toUpperCase(),
    version: Number(row[header.version] || 0),
    report: parseDailyReportJson_(row[header.report_json], {}),
    images: parseDailyReportImages_(row[header.images_json]),
    created_at: formatDailyReportTimestamp_(row[header.created_at]),
    created_by: String(row[header.created_by] || ""),
    updated_at: formatDailyReportTimestamp_(row[header.updated_at]),
    updated_by: String(row[header.updated_by] || ""),
    submitted_at: formatDailyReportTimestamp_(row[header.submitted_at]),
    submitted_by: String(row[header.submitted_by] || ""),
    emailed_at: formatDailyReportTimestamp_(row[header.emailed_at]),
    email_recipients: String(row[header.email_recipients] || "")
  };
}


function parseDailyReportImages_(value) {
  const images = parseDailyReportJson_(value, []);
  if (!Array.isArray(images)) return [];
  return images.map(function (image) {
    return {
      file_id: String(image && image.file_id || ""),
      file_name: String(image && image.file_name || ""),
      original_name: String(image && image.original_name || ""),
      mime_type: String(image && image.mime_type || ""),
      size_bytes: Number(image && image.size_bytes || 0),
      url: String(image && image.url || ""),
      media_kind: String(image && image.media_kind || (String(image && image.mime_type || "").indexOf("video/") === 0 ? "VIDEO" : "IMAGE")).toUpperCase(),
      attachment_type: String(image && image.attachment_type || "ISSUE_MEDIA").toUpperCase() === "SERIAL" ? "SERIAL" : "ISSUE_MEDIA"
    };
  }).filter(function (image) {
    return !!image.file_id;
  });
}


function parseDailyReportJson_(value, fallback) {
  try {
    if (value && typeof value === "object") return value;
    const text = String(value || "").trim();
    return text ? JSON.parse(text) : fallback;
  } catch (_) {
    return fallback;
  }
}


function formatDailyReportTimestamp_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  }
  return String(value);
}


function formatDailyReportDate_(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[1] + "/" + Number(match[2]) + "/" + Number(match[3]) : text;
}


/** GASエディタから任意で1回実行できます。通常は初回アクセス時に自動作成されます。 */
function setupDailyReportSheet() {
  const sheet = getDailyReportSheet_();
  return {
    sheet_name: sheet.getName(),
    sheet_id: sheet.getSheetId(),
    recipients: DAILY_REPORT_ADMIN_EMAILS.slice()
  };
}
