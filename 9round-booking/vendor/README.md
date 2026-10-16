# Bundled QR libraries

No external QR service, CDN, image upload or paid API is used. QR generation and
image decoding both run locally in the member/staff browser.

- `qrcode.min.js`: qrcode-generator **2.0.4**, Kazuhiko Arase, MIT.
  Source: https://github.com/kazuhikoarase/qrcode-generator/tree/master/js
  npm tarball SHA-1: `e8b3f30922577eba52078aa9c0d5a2a74fe1fd94`.
  Full license: `qrcode-LICENSE.txt`.
- `jsqr.min.js`: jsqr **1.4.0**, Cozmo, Apache-2.0.
  Source: https://github.com/cozmo/jsQR
  npm tarball SHA-1: `8efb8d0a7cc6863cb6d95116b9069123ce9eb2d1`.
  Full license: `jsqr-LICENSE.txt`.

The pinned npm distributions were minified with Terser (compression and name
mangling, no behavior changes). GAS templates inline these local copies.
