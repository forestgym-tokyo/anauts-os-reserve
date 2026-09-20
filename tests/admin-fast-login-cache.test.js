const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const admin = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");

function jwt(subject) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ sub: subject })}.signature`;
}

test("validated login bootstrap is reused only for the same Firebase user", () => {
  const start = admin.indexOf('const AUTH_BOOTSTRAP_CACHE_KEY=');
  const end = admin.indexOf("function roleHonorific", start);
  assert.ok(start >= 0 && end > start);
  const source = admin.slice(start, end);

  const storage = new Map();
  const context = {
    Date,
    JSON,
    String,
    atob: value => Buffer.from(value, "base64").toString("binary"),
    localStorage: {
      get length() { return storage.size; },
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
      key(index) { return Array.from(storage.keys())[index] || null; }
    },
    state: {
      idToken: jwt("uid-1"),
      authUser: { staff_code: "STAFF1", permission: "STAFF" },
      staffScheduleBootstrapDate: "2026-09-20",
      staffScheduleDate: "2026-09-20",
      staffScheduleBootstrapError: "",
      staffSchedule: { shifts: [], reservations: [] }
    }
  };

  vm.createContext(context);
  vm.runInContext(`${source};saveAuthBootstrapCache_();result=readAuthBootstrapCache_();`, context);
  assert.equal(context.result.profile.staff_code, "STAFF1");

  context.state.idToken = jwt("uid-2");
  vm.runInContext("result=readAuthBootstrapCache_();", context);
  assert.equal(context.result, null);
});

test("logout cache cleanup includes monthly schedule snapshots", () => {
  assert.match(admin, /localStorage\.removeItem\(AUTH_BOOTSTRAP_CACHE_KEY\)/);
  assert.match(admin, /key\.startsWith\("anauts_monthly_cache_v1:"\)/);
  assert.match(admin, /function logout\(\)[\s\S]*?clearFastLocalCaches_\(\)/);
});
