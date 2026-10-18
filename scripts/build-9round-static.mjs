import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const output = args.includes("--out") && option("--out");
const apiUrl = args.includes("--api-url") && option("--api-url");
if (!output || !/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(apiUrl || "")) {
  throw new Error("--out and the verified public --api-url are required");
}
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../9round-booking");
const target = path.resolve(output);
if (target === source || target.startsWith(source + path.sep)) throw new Error("Output must be separate from source");
const files = ["index.html", "styles.css", "api.js", "app.js", "fighter.js", "member-tools.js", "pwa.js", "service-worker.js", "manifest.webmanifest", "link-actions.html", "link-actions.js", "trial/index.html", "trial/styles.css", "trial/app.js", "vendor/qrcode.min.js", "vendor/qrcode-LICENSE.txt", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];
for (const file of files) {
  const dest = path.join(target, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(source, file), dest);
}
fs.writeFileSync(path.join(target, "config.js"), "// Public member app; all membership and reservation checks remain on the server.\nwindow.ANAUTS_ROUND9_BOOKING = Object.freeze(" + JSON.stringify({ apiUrl, firebaseApiKey: "", requestTimeoutMs: 30000, preferLegacy: args.includes("--legacy-ui"), legacyMemberUrl: apiUrl + "?page=member" }, null, 2) + ");\n");
console.log(JSON.stringify({ output: target, files: files.length + 1 }));
