// Run with: node --test tests/tfg-web-membership.test.cjs
// Runs entirely in memory; never connects to actual member data or Google APIs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../gas/94_TfgWebMembershipEnrollment.gs"), "utf8"
);
const formSheetId = "1wf1NaznPKXCrkr6lNhxSrh82WGVazcT-D8vt1z9aQkw";
const masterHeaders = [
  "memberNo", "name", "email", "status", "dupOk", "adminUnlimited",
  "note", "プラン", "キャンペーン", "特典", "スタート日",
  "初期費用", "初月日割り会費", "クレカ登録状況", "PDFファイルID",
  "下書き作成日時", "Gmail下書きID", "gender", "未払金"
];

function createSheet(rows, options = {}) {
  return {
    rows,
    maxColumns: 26,
    getLastRow() { return this.rows.length; },
    getLastColumn() { return Math.max(...this.rows.map(x => x.length)); },
    getMaxColumns() { return this.maxColumns; },
    insertColumnsAfter(_column, extra) { this.maxColumns += extra; },
    appendRow(values) { this.rows.push([...values]); },
    getRange(row, col, rowCount = 1, colCount = 1) {
      const sheet = this;
      return {
        getValue() { return sheet.rows[row - 1]?.[col - 1] ?? ""; },
        setValue(value) {
          while (sheet.rows.length < row) sheet.rows.push([]);
          sheet.rows[row - 1][col - 1] = value;
          return this;
        },
        getValues() {
          return Array.from({length:rowCount}, (_x,i) =>
            Array.from({length:colCount}, (_y,j) =>
              sheet.rows[row - 1 + i]?.[col - 1 + j] ?? ""));
        },
        setValues(matrix) {
          assert.equal(matrix.length, rowCount);
          matrix.forEach(x => assert.equal(x.length, colCount));
          if (options.failMembershipLinkOnce &&
              col === 19 && row > 1) {
            options.failMembershipLinkOnce = false;
            throw new Error("Simulated failure after master assignment");
          }
          for (let i = 0; i < rowCount; i++) {
            while (sheet.rows.length < row + i) sheet.rows.push([]);
            for (let j = 0; j < colCount; j++) {
              sheet.rows[row - 1 + i][col - 1 + j] = matrix[i][j];
            }
          }
          return this;
        }
      };
    }
  };
}

function member(no, name = "", email = "", status = "") {
  const row = Array(19).fill("");
  Object.assign(row, {0:no, 1:name, 2:email, 3:status});
  return row;
}

function setup(options = {}) {
  const master = createSheet([
    masterHeaders,
    member("150001", "在籍 一郎", "active@example.com", "ACT"),
    member("150002", "退会 花子", "return@example.com", ""),
    member("150003"),
    member("150004")
  ]);
  const form = createSheet([[
    "送信日時", "姓", "名", "セイ", "メイ", "生年月日",
    "電話番号", "メールアドレス", "郵便番号", "住所",
    "番地・建物名", "キャンペーン", "会員種別", "利用開始日",
    "特典", "初回金額", "決済URL", "顔写真URL"
  ]], options);
  const cache = new Map();
  const email = [];
  let enabled = options.enabled !== false;
  let lockCalls = 0;
  const context = {
    SpreadsheetApp: {
      openById(id) {
        const s = id === formSheetId ? form : master;
        return {getSheetByName(name) {
          return ["membership_form", "master"].includes(name) ? s : null;
        }};
      },
      flush() {}
    },
    LockService: {getScriptLock() {
      return {waitLock() {lockCalls++;}, releaseLock() {}};
    }},
    CacheService: {getScriptCache() {
      return {put(k,v) {cache.set(k,v);}, get(k) {return cache.get(k)||null;}};
    }},
    PropertiesService: {getScriptProperties() {
      return {getProperty(key) {
        return key === "TFG_WEB_JOIN_ENABLED" ? (enabled ? "true" : "false") : null;
      }};
    }},
    ContentService: {
      MimeType: {JSON:"json",JAVASCRIPT:"javascript",TEXT:"text"},
      createTextOutput(text) {
        return {text,mime:"",setMimeType(type){this.mime=type;return this;}};
      }
    },
    MailApp: {sendEmail(payload){email.push(payload);}},
    UrlFetchApp: {fetch(){throw new Error("Unexpected LINE network call");}},
    Utilities: {formatDate(d){return d.toISOString().slice(0,10);}},
    console: {error(){}}
  };
  vm.createContext(context);
  vm.runInContext(source, context, {filename:"94_TfgWebMembershipEnrollment.gs"});
  function send(payload) {
    return JSON.parse(context.tfwSubmitWebEnrollment_(payload).text);
  }
  return {
    master, form, email, cache, send,
    status: (params) => context.tfwWebEnrollmentStatus_(params),
    disable() {enabled = false;},
    lockCount: () => lockCalls
  };
}

function request(id, {first="花子",last="新規",email="new@example.com"} = {}) {
  return {
    action:"submitTfgWebMembership", applicationId:id,
    firstName:first,lastName:last,email,phone:"09000000000",
    plan:"REGULAR",campaign:"利用する",startDate:"2026-10-20",
    benefit:"2か月目会費無料",firstTotal:"2,000円",
    paymentUrl:"https://getsugaku-panda.jp/subscription/apply/17643",
    facePhotoUrl:"https://res.cloudinary.com/example/photo.jpg",
    adAttribution:{gclid:"click-id"}
  };
}

test("new WEB member receives exactly one ACT row and attributed form record", () => {
  const h = setup();
  const a = h.send(request("tfg-test-000001"));
  assert.equal(a.ok,true);
  assert.equal(h.master.rows[4][0],"150004");
  assert.equal(h.master.rows[4][3],"ACT");
  assert.match(h.master.rows[4][6],/WEB_JOIN_ID=tfg-test-000001/);
  assert.equal(h.form.rows[1][18],"150004");
  assert.equal(h.form.rows[1][20],"登録済");
  assert.equal(h.form.rows[1][21],"click-id");
  assert.equal(h.email.length,1);
  assert.equal(h.lockCount(),1);
});

test("same request, including page reload, never issues another number", () => {
  const h = setup(), r = request("tfg-test-000002");
  h.send(r);
  const second = h.send(r);
  assert.equal(second.ok,true);
  assert.equal(second.duplicate,true);
  assert.equal(h.form.rows.length,2);
  assert.equal(h.email.length,1);
  assert.equal(h.master.rows[3][3],"");
});

test("ACT blocks a second account for the same person", () => {
  const h = setup();
  const r = h.send(request("tfg-test-000003",{
    first:"一郎",last:"在籍",email:"active@example.com"
  }));
  assert.equal(r.ok,false);
  assert.equal(r.code,"ACTIVE_MEMBER_EXISTS");
  assert.equal(h.form.rows.length,1);
});

test("blank status is withdrawn: reuse neither identity nor former number", () => {
  const h = setup();
  const r = h.send(request("tfg-test-000004",{
    first:"花子",last:"退会",email:"return@example.com"
  }));
  assert.equal(r.ok,true);
  assert.equal(h.master.rows[2][0],"150002");
  assert.equal(h.master.rows[2][3],"");
  assert.equal(h.master.rows[4][3],"ACT");
});

test("active email with different name requires review", () => {
  const h = setup();
  const r = h.send(request("tfg-test-000005",{
    first:"太郎",last:"家族",email:"active@example.com"
  }));
  assert.equal(r.ok,false);
  assert.equal(r.code,"ACTIVE_EMAIL_IN_USE");
});

test("application ID collision with another identity fails closed", () => {
  const h = setup();
  h.send(request("tfg-test-000006"));
  const r = h.send(request("tfg-test-000006",{
    first:"別",last:"他人",email:"other@example.com"
  }));
  assert.equal(r.ok,false);
  assert.equal(r.code,"APPLICATION_ID_CONFLICT");
});

test("partial form-link failure recovers from master marker without new number", () => {
  const h = setup({failMembershipLinkOnce:true}), r = request("tfg-test-000007");
  const first = h.send(r);
  assert.equal(first.ok,false);
  assert.equal(first.code,"REGISTRATION_ERROR");
  assert.equal(h.master.rows[4][3],"ACT");
  const second = h.send(r);
  assert.equal(second.ok,true);
  assert.equal(second.duplicate,true);
  assert.equal(h.form.rows[1][18],"150004");
  assert.equal(h.master.rows[3][3],"");
  assert.equal(h.email.length,1);
});

test("rollout disabled by default protects existing production system", () => {
  const h = setup({enabled:false});
  const r = h.send(request("tfg-test-000008"));
  assert.equal(r.ok,false);
  assert.equal(r.code,"FEATURE_DISABLED");
  assert.equal(h.form.rows.length,1);
});

test("invalid payment domain is rejected", () => {
  const h=setup();
  const r=h.send({...request("tfg-test-000009"),paymentUrl:"https://evil.example/pay"});
  assert.equal(r.ok,false);
  assert.equal(r.code,"INVALID_PAYMENT_URL");
});

test("anonymous status response carries no customer PII or member number", () => {
  const h=setup();
  h.send(request("tfg-test-000010"));
  const out=h.status({
    applicationId:"tfg-test-000010",
    callback:"tfgJoinCb_12345678"
  });
  assert.equal(out.mime,"javascript");
  assert.match(out.text,/"ok":true/);
  assert.ok(!out.text.includes("150004"));
  assert.ok(!out.text.includes("new@example.com"));
});
