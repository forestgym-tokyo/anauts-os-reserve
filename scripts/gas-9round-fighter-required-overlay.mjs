import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

// Apply only this release's two source patches to a fresh live snapshot.
// Any conflicting live edit stops the release before clasp push.
const live = path.resolve(process.env.ROUND9_LIVE_DIR || ".9round-live");
const base = "eda58632c9c5b79aa10b8a205858b9dd39a879e9";
const targets = ["Booking.gs", "Member.html"];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "nr-fighter-overlay-"));
const mappings = targets.map(name => {
  const options = [name, name.replace(/\.gs$/, ".js")];
  const found = [...new Set(options)].filter(file => fs.existsSync(path.join(live, file)));
  if (found.length !== 1) throw new Error("Expected exactly one live file for " + name);
  return { name, file: found[0] };
});
try {
  for (const { name, file } of mappings) fs.copyFileSync(path.join(live, file), path.join(temporary, name));
  const patch = execFileSync("git", ["diff", "--no-ext-diff", "--unified=3", base, "HEAD", "--",
    ...targets.map(name => "9round-booking/gas/" + name)], { encoding: "utf8" });
  if (!patch.includes("FIGHTER_NAME_REQUIRED") || !patch.includes("updateBookingButtons")) {
    throw new Error("Required reservation and member-screen patches are missing");
  }
  const patchFile = path.join(temporary, "release.patch");
  fs.writeFileSync(patchFile, patch);
  execFileSync("git", ["apply", "--check", "--unsafe-paths", "--directory=" + temporary, "-p3", patchFile]);
  execFileSync("git", ["apply", "--unsafe-paths", "--directory=" + temporary, "-p3", patchFile]);
  const booking = fs.readFileSync(path.join(temporary, "Booking.gs"), "utf8");
  const member = fs.readFileSync(path.join(temporary, "Member.html"), "utf8");
  if (!booking.includes('nrBookingError_("FIGHTER_NAME_REQUIRED"') ||
      !member.includes("fighter.onChange = updateBookingButtons") ||
      !member.includes("ファイター登録（必須）")) throw new Error("Patched source validation failed");
  for (const { name, file } of mappings) fs.copyFileSync(path.join(temporary, name), path.join(live, file));
  console.log("Verified fighter registration patch; other live source files are preserved.");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
