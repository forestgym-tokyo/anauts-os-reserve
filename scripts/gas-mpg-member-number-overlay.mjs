import fs from "node:fs";

const path = ".gas-live/99_Main.js";
let src = fs.readFileSync(path, "utf8");

if (!src.includes('case "sendMpgMemberNumberReminder"')) {
  const needle = [
    '      case "verifyMpgSuspensionMember":',
    '        return verifyMpgSuspensionMember_(',
    '          body',
    '        );'
  ].join("\n");

  if (!src.includes(needle)) {
    throw new Error("verifyMpgSuspensionMember dispatch point not found in live 99_Main.js");
  }

  const insert = [
    '      case "sendMpgMemberNumberReminder":',
    '        return sendMpgMemberNumberReminder_(',
    '          body',
    '        );',
    '',
    needle
  ].join("\n");

  src = src.replace(needle, insert);
  fs.writeFileSync(path, src, "utf8");
}

console.log("MPG member-number reminder dispatch overlay OK");
