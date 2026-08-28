const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const admin = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
const config = fs.readFileSync(path.join(root, "admin", "firebase-config.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
const auth = fs.readFileSync(path.join(root, "gas", "50_Auth.gs"), "utf8");

assert.match(admin, /include_staff_schedule:\s*"1"/);
assert.match(admin, /staff_schedule_error/);
assert.match(admin, /retryStaffScheduleButton/);
assert.match(admin, /staffScheduleRequestSequence_/);
assert.match(admin, /markAdminCoreReady_\(\)/);

assert.ok(
  config.indexOf("workspaceUrl,") < config.indexOf("primaryUrl\n"),
  "Workspace route must be attempted before the public Apps Script route"
);
assert.match(config, /Promise\.race\(\[/);
assert.match(config, /return parseApiResponse_\(response, action\)/);
assert.match(config, /API_REQUEST_TIMEOUT_MS\s*=\s*20000/);
assert.match(config, /anauts:admin-core-ready/);
assert.match(config, /for \(var i = 0; i < addonSources\.length; i \+= 1\)/);
assert.doesNotMatch(config, /window\.addEventListener\("load", function \(\) \{\s*var monthly/);

assert.match(indexHtml, /rel="preconnect" href="https:\/\/script\.google\.com"/);
assert.match(indexHtml, /20260828-ipad-staff-schedule-v3/);

assert.match(auth, /getStaffSchedule\(params\)/);
assert.match(auth, /CacheService\.getScriptCache\(\)/);
assert.match(auth, /DigestAlgorithm\.SHA_256/);
assert.doesNotMatch(auth, /cache\.put\(\s*idToken/);

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const token = [
  base64UrlJson({ alg: "RS256", typ: "JWT" }),
  base64UrlJson({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  "signature"
].join(".");

const cache = new Map();
const cacheWrites = [];
let firebaseLookups = 0;

const context = {
  console,
  Date,
  JSON,
  Math,
  String,
  PropertiesService: {
    getScriptProperties() {
      return { getProperty() { return "firebase-api-key"; } };
    }
  },
  CacheService: {
    getScriptCache() {
      return {
        get(key) { return cache.get(key) || null; },
        put(key, value, ttl) {
          cache.set(key, value);
          cacheWrites.push({ key, value, ttl });
        }
      };
    }
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest(_algorithm, value) {
      return Array.from(crypto.createHash("sha256").update(value).digest())
        .map((byte) => byte > 127 ? byte - 256 : byte);
    },
    base64DecodeWebSafe(value) {
      return Array.from(Buffer.from(value, "base64url"));
    },
    newBlob(bytes) {
      return { getDataAsString() { return Buffer.from(bytes).toString("utf8"); } };
    }
  },
  UrlFetchApp: {
    fetch() {
      firebaseLookups += 1;
      return {
        getResponseCode() { return 200; },
        getContentText() {
          return JSON.stringify({ users: [{ email: "staff@example.com", localId: "uid-1" }] });
        }
      };
    }
  },
  SpreadsheetApp: {},
  successResponse(data) { return { ok: true, data }; },
  errorResponse(message, code) { return { ok: false, message, code }; }
};

vm.createContext(context);
vm.runInContext(auth, context, { filename: "50_Auth.gs" });

const first = context.lookupFirebaseUser_(token);
const second = context.lookupFirebaseUser_(token);

assert.equal(first.email, "staff@example.com");
assert.equal(second.email, "staff@example.com");
assert.equal(firebaseLookups, 1, "The second authorization must use the verified-token cache");
assert.equal(cacheWrites.length, 1);
assert.notEqual(cacheWrites[0].key, token);
assert.ok(cacheWrites[0].key.length < 100);
assert.ok(cacheWrites[0].ttl > 0 && cacheWrites[0].ttl <= 3300);

context.requireAuth_ = function () {
  return { profile: { email: "staff@example.com", permission: "STAFF" } };
};
context.getStaffSchedule = function () {
  return {
    getContent() {
      return JSON.stringify({
        ok: true,
        data: { date: "2026-08-28", shifts: [], reservations: [] }
      });
    }
  };
};

const bootstrap = context.getCurrentUser({
  include_staff_schedule: "1",
  date: "2026-08-28"
});

assert.equal(bootstrap.ok, true);
assert.equal(bootstrap.data.profile.email, "staff@example.com");
assert.equal(bootstrap.data.staff_schedule.date, "2026-08-28");
assert.equal(bootstrap.data.staff_schedule_error, "");

console.log("admin iPad staff schedule tests passed");
