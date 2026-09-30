import fs from "node:fs";

const path = ".gas-live/99_Main.js";
let src = fs.readFileSync(path, "utf8");

if (!src.includes('case "getTfgSettlementMember"')) {
  const anchor = [
    '      case "createTfgSettlement":',
    '        requireAuth_(body, ["ADMIN", "MANAGER"]);',
    '        return createTfgSettlement_(body);'
  ].join("\n");

  const replacement = [
    '      case "getTfgSettlementMember":',
    '        requireAuth_(body, ["ADMIN", "MANAGER"]);',
    '        return getTfgSettlementMember_(body);',
    '',
    '      case "createTfgSettlement":',
    '        requireAuth_(body, ["ADMIN", "MANAGER"]);',
    '        return createTfgSettlement_(body);'
  ].join("\n");

  if (!src.includes(anchor)) {
    throw new Error("Could not locate createTfgSettlement route in live 99_Main.js");
  }

  src = src.replace(anchor, replacement);
  fs.writeFileSync(path, src);
}
