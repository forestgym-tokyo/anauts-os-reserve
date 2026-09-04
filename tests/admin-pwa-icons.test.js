const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.join(__dirname, "..");
const adminRoot = path.join(root, "admin");
const indexHtml = fs.readFileSync(path.join(adminRoot, "index.html"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(adminRoot, "manifest.webmanifest"), "utf8")
);

assert.match(indexHtml, /rel="manifest" href="\.\/manifest\.webmanifest\?v=20260904-white-v2"/);
assert.match(indexHtml, /rel="apple-touch-icon" sizes="180x180" href="\.\/icons\/apple-touch-icon-white-v2\.png"/);
assert.match(indexHtml, /rel="icon" type="image\/svg\+xml" href="\.\/icons\/admin-app-mark-white-v2\.svg"/);
assert.match(indexHtml, /rel="icon" type="image\/png" sizes="32x32" href="\.\/icons\/favicon-white-v2-32\.png"/);
assert.match(indexHtml, /rel="icon" type="image\/png" sizes="192x192" href="\.\/icons\/icon-white-v2-192\.png"/);
assert.match(indexHtml, /name="apple-mobile-web-app-capable" content="yes"/);

assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.deepEqual(
  manifest.icons.map(({ src, sizes }) => [src, sizes]),
  [
    ["./icons/icon-white-v2-192.png", "192x192"],
    ["./icons/icon-white-v2-512.png", "512x512"]
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

function assertOpaqueWhiteTopLeft(filename) {
  const image = fs.readFileSync(path.join(adminRoot, "icons", filename));
  let offset = 8;
  let colorType;
  const idat = [];

  while (offset < image.length) {
    const length = image.readUInt32BE(offset);
    const type = image.toString("ascii", offset + 4, offset + 8);
    const data = image.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") colorType = data[9];
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") break;
    offset += 12 + length;
  }

  assert.equal(colorType, 6, `${filename} must be an RGBA PNG`);
  const scanlines = zlib.inflateSync(Buffer.concat(idat));
  assert.ok(scanlines[0] <= 4, `${filename} must use a valid PNG filter`);
  assert.deepEqual(
    [...scanlines.subarray(1, 5)],
    [255, 255, 255, 255],
    `${filename} must have an opaque white background`
  );
}

const expectedIcons = [
  ["favicon-white-v2-32.png", 32, 32],
  ["apple-touch-icon-white-v2.png", 180, 180],
  ["icon-white-v2-192.png", 192, 192],
  ["icon-white-v2-512.png", 512, 512]
];

for (const [filename, width, height] of expectedIcons) {
  assertPngSize(filename, width, height);
  assertOpaqueWhiteTopLeft(filename);
}
