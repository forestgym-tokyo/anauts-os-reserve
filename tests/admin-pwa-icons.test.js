const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const adminRoot = path.join(root, "admin");
const indexHtml = fs.readFileSync(path.join(adminRoot, "index.html"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(adminRoot, "manifest.webmanifest"), "utf8")
);

assert.match(indexHtml, /rel="manifest" href="\.\/manifest\.webmanifest"/);
assert.match(indexHtml, /rel="apple-touch-icon" sizes="180x180"/);
assert.match(indexHtml, /rel="icon" type="image\/png" sizes="32x32"/);
assert.match(indexHtml, /rel="icon" type="image\/png" sizes="192x192"/);
assert.match(indexHtml, /name="apple-mobile-web-app-capable" content="yes"/);

assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.deepEqual(
  manifest.icons.map(({ src, sizes }) => [src, sizes]),
  [
    ["./icons/icon-192.png", "192x192"],
    ["./icons/icon-512.png", "512x512"]
  ]
);

function assertPngSize(filename, expectedWidth, expectedHeight) {
  const image = fs.readFileSync(path.join(adminRoot, "icons", filename));
  assert.deepEqual(
    [...image.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${filename} must be a valid PNG`
  );
  assert.equal(image.readUInt32BE(16), expectedWidth, `${filename} width`);
  assert.equal(image.readUInt32BE(20), expectedHeight, `${filename} height`);
}

assertPngSize("favicon-32.png", 32, 32);
assertPngSize("apple-touch-icon.png", 180, 180);
assertPngSize("icon-192.png", 192, 192);
assertPngSize("icon-512.png", 512, 512);
