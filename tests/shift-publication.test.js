const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function functionSource(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(match, `${name} must exist`);
  return match[0];
}

function publicationContext(map = {}) {
  const source = read("gas/62_ShiftPublication.gs");
  const names = ["normalizeStaffShiftPublicationStore_", "staffShiftPublicationMonthsInRange_",
    "formatStaffShiftPublicationMessage_", "isStaffShiftMonthPublishedFromMap_",
    "enforceStaffShiftPublication_"];
  const context = {
    STAFF_SHIFT_PUBLICATION_START_MONTH: "2026-10",
    STAFF_SHIFT_PUBLICATION_STORE: "SOGA",
    parseAuthJsonResponse_: value => value,
    successResponse: data => ({ ok: true, data }),
    errorResponse: (message, code, details) => ({ ok: false, message, code, details }),
    getStaffShiftPublicationMap_: () => map
  };
  vm.runInNewContext(names.map(name => functionSource(source, name)).join("\n"), context);
  return context;
}

test("publication policy keeps legacy and non-SOGA shifts visible", () => {
  const context = publicationContext({ "SOGA|2026-10": "PUBLISHED" });
  assert.equal(context.isStaffShiftMonthPublishedFromMap_({}, "SOGA", "2026-09"), true);
  assert.equal(context.isStaffShiftMonthPublishedFromMap_({}, "SOGA", "2026-10"), false);
  assert.equal(context.isStaffShiftMonthPublishedFromMap_({}, "YACHIYO", "2026-10"), true);
  assert.equal(context.isStaffShiftMonthPublishedFromMap_({ "SOGA|2026-10": "PUBLISHED" }, "SOGA", "2026-10"), true);
});

test("ADMIN and MANAGER view drafts while STAFF receives a public-before state", () => {
  const context = publicationContext({});
  const response = { ok: true, data: [{shift_id:"shift-1",staff_code:"STAFF1",store_code:"SOGA",date:"2026-10-01"}] };
  const params = { store_code:"SOGA", start_date:"2026-10-01", end_date:"2026-10-31" };
  const admin = { permission:"ADMIN", profile:{store_code:"SOGA"} };
  const manager = { permission:"MANAGER", profile:{store_code:"SOGA"} };
  const staff = { permission:"STAFF", profile:{store_code:"SOGA"} };
  assert.equal(context.enforceStaffShiftPublication_(response, params, admin), response);
  assert.equal(context.enforceStaffShiftPublication_(response, params, manager), response);
  const blocked = context.enforceStaffShiftPublication_(response, params, staff);
  assert.equal(blocked.ok, true);
  assert.equal(blocked.data.publication.status, "DRAFT");
  assert.equal(blocked.data.publication.is_published, false);
  assert.equal(blocked.data.shifts.length, 0);
  assert.match(blocked.data.publication.message, /公開前です/);
});

test("STAFF responses omit unpublished rows without a month range", () => {
  const context = publicationContext({});
  const response = { ok:true, data:[
    {shift_id:"legacy",store_code:"SOGA",date:"2026-09-30"},
    {shift_id:"draft",store_code:"SOGA",date:"2026-10-01"}
  ]};
  const result = context.enforceStaffShiftPublication_(response, {}, {permission:"STAFF",profile:{store_code:"SOGA"}});
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.data.shifts, row => row.shift_id), ["legacy"]);
  assert.equal(result.data.publication.has_hidden_shifts, true);
});

test("publish permission, re-draft, routes, and public-before screens are wired", () => {
  const publication = read("gas/62_ShiftPublication.gs");
  const board = read("gas/61_SogaShiftBoard.gs");
  const main = read("gas/99_Main.gs");
  const ui = read("admin/admin-soga-shifts.js");
  const admin = read("admin/admin.js");
  const monthly = read("admin/admin-monthly-v58.js");
  assert.match(publication, /function publishStaffShiftMonth\(body\)[\s\S]*?requireAuth_\(body, \["ADMIN"\]\)/);
  assert.match(publication, /function markStaffShiftMonthDraft_/);
  assert.match(board, /function saveSogaShiftAssignments\(body\)[\s\S]*?markStaffShiftMonthDraft_\(storeCode, month\)/);
  assert.match(main, /return enforceStaffShiftPublication_\(response, safeParams, auth\)/);
  assert.match(main, /case "publishStaffShiftMonth"/);
  assert.match(ui, /const administrator=\(\)=>permission\(\)==="ADMIN"/);
  assert.match(ui, /未保存の調整があります/);
  assert.match(admin, /publication\?\.is_published===false[\s\S]*?公開前/);
  assert.match(monthly, /publication\?\.is_published===false[\s\S]*?公開前/);
  assert.doesNotMatch(publication, /管理者が公開するまで閲覧できません/);
});
