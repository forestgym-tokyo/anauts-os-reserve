const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "gas", "72_TourReplyHistory.gs"),
  "utf8"
);
const main = fs.readFileSync(path.join(root, "gas", "99_Main.gs"), "utf8");

class FakeRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  getValues() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.values[this.row - 1 + rowOffset]?.[
          this.column - 1 + columnOffset
        ] ?? ""
      )
    );
  }

  setValues(rows) {
    rows.forEach((row, rowOffset) => {
      const targetRow = this.row - 1 + rowOffset;
      if (!this.sheet.values[targetRow]) this.sheet.values[targetRow] = [];
      row.forEach((value, columnOffset) => {
        this.sheet.values[targetRow][this.column - 1 + columnOffset] = value;
      });
    });
    return this;
  }

  setValue(value) {
    return this.setValues([[value]]);
  }

  setFontWeight() {
    return this;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.values = [];
  }

  getLastRow() {
    return this.values.length;
  }

  getLastColumn() {
    return this.values.reduce((max, row) => Math.max(max, row.length), 0);
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }

  getDataRange() {
    return this.getRange(1, 1, this.getLastRow(), this.getLastColumn());
  }

  setFrozenRows() {}
  setColumnWidth() {}
}

class FakeSpreadsheet {
  constructor() {
    this.sheets = new Map();
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

const spreadsheet = new FakeSpreadsheet();
let sendCount = 0;
let handledStatus = null;
const lock = { waitLock() {}, releaseLock() {} };

const context = {
  console,
  Utilities: { getUuid: () => "server-request-id" },
  LockService: { getScriptLock: () => lock },
  SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
  successResponse: data => ({ ok: true, data }),
  errorResponse: (message, code, data) => ({ ok: false, message, code, data }),
  sendTourCustomerReply: payload => {
    sendCount += 1;
    assert.equal(payload.handler_email, "staff@example.com");
    return {
      ok: true,
      data: { to: "guest@example.com", message_id: "gmail-message-1" }
    };
  },
  setTourInquiryStatus: payload => {
    handledStatus = payload;
    return { ok: true, data: payload };
  }
};

vm.createContext(context);
vm.runInContext(source, context);

const auth = {
  email: "staff@example.com",
  staff_code: "S001",
  profile: {
    email: "staff@example.com",
    staff_code: "S001",
    display_name: "担当スタッフ"
  }
};
const payload = {
  request_id: "tour-reply-test-1",
  reservation_id: "RES-001",
  customer_email: "guest@example.com",
  subject: "見学について",
  body: "お問い合わせありがとうございます。"
};

const sent = context.sendTourCustomerReplyV2(payload, auth);
assert.equal(sent.ok, true);
assert.equal(sent.data.history_saved, true);
assert.equal(sendCount, 1);
assert.equal(handledStatus.inquiry_status, "DONE");
assert.equal(handledStatus.handler_name, "担当スタッフ");

const history = context.getTourReplyHistoryV2({ reservation_id: "RES-001" });
assert.equal(history.ok, true);
assert.equal(history.data.replies.length, 1);
assert.equal(history.data.replies[0].subject, "見学について");
assert.equal(history.data.replies[0].body, "お問い合わせありがとうございます。");
assert.equal(history.data.replies[0].handler_name, "担当スタッフ");

const duplicate = context.sendTourCustomerReplyV2(payload, auth);
assert.equal(duplicate.ok, true);
assert.equal(duplicate.data.duplicate, true);
assert.equal(sendCount, 1, "同じrequest_idではメールを二重送信しない");

assert.match(main, /case "getTourReplyHistory"[\s\S]*?getTourReplyHistoryV2/);
assert.match(main, /case "sendTourCustomerReplyV2"[\s\S]*?sendTourCustomerReplyV2/);
assert.doesNotMatch(source, /MailApp\.sendEmail|GmailApp\.sendEmail/);

console.log("tour reply history tests passed");
