const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "admin", "admin-auth-refresh.js"), "utf8");

new Function(source);

assert.match(source, /securetoken\.googleapis\.com\/v1\/token/);
assert.match(source, /grant_type:"refresh_token"/);
assert.match(source, /REFRESH_MARGIN_MS=5\*60\*1000/);
assert.match(source, /apiGet=wrapApi_\(apiGet\)/);
assert.match(source, /apiPost=wrapApi_\(apiPost\)/);
assert.match(source, /isExpiredAuthError_/);

for (const page of ["index.html", "admin.html"]) {
  const html = fs.readFileSync(path.join(root, "admin", page), "utf8");
  const refreshIndex = html.indexOf("admin-auth-refresh.js?v=20260903-auth-refresh-v1");
  const adminIndex = html.indexOf("admin.js?v=20260831-soga-admin-reset-v1");
  assert.ok(refreshIndex >= 0, `${page} は認証更新スクリプトを読み込む`);
  assert.ok(refreshIndex < adminIndex, `${page} は管理画面起動前に認証更新を準備する`);
}

function jwt(exp) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp })}.signature`;
}

(async () => {
  const storage = new Map();
  const expiredToken = jwt(Math.floor(Date.now() / 1000) - 60);
  storage.set("anauts_id_token", expiredToken);
  storage.set("anauts_refresh_token", "refresh-1");
  storage.set("anauts_id_token_expires_at", String(Date.now() - 60000));

  let domReady = null;
  let refreshCalls = 0;
  let apiCalls = 0;
  const context = {
    console,
    URLSearchParams,
    atob: value => Buffer.from(value, "base64").toString("binary"),
    document: {
      readyState: "loading",
      addEventListener(name, listener) {
        if (name === "DOMContentLoaded") domReady = listener;
      }
    },
    sessionStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    state: { idToken: expiredToken },
    authEnabled: () => true,
    apiGet: async () => {
      apiCalls += 1;
      return context.state.idToken;
    },
    apiPost: async () => ({ ok: true }),
    firebaseSignIn: async () => ({}),
    restoreAuthSession: async () => true,
    firebaseChangePassword: async () => ({}),
    logout: () => {},
    ANAUTS_AUTH: { enabled: true, firebaseApiKey: "test-api-key" },
    fetch: async () => {
      refreshCalls += 1;
      return {
        ok: true,
        json: async () => ({
          id_token: jwt(Math.floor(Date.now() / 1000) + 3600),
          refresh_token: "refresh-2",
          expires_in: "3600"
        })
      };
    }
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(source, context);
  assert.equal(typeof domReady, "function");
  domReady();

  const refreshedToken = await context.apiGet("health");
  assert.equal(refreshCalls, 1, "期限切れ時だけ更新通信を1回行う");
  assert.equal(apiCalls, 1, "更新後に本来のAPIを1回だけ呼ぶ");
  assert.equal(refreshedToken, context.state.idToken);
  assert.equal(storage.get("anauts_refresh_token"), "refresh-2");

  await context.apiGet("health");
  assert.equal(refreshCalls, 1, "有効期限内は更新通信を増やさない");

  console.log("admin auth refresh tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
