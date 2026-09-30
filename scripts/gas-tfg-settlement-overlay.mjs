import fs from "node:fs";

const path = ".gas-live/99_Main.js";
let src = fs.readFileSync(path, "utf8");

function insertBefore_(anchorLines, newLines, errorMessage) {
  const anchor = anchorLines.join("\n");
  if (!src.includes(anchor)) throw new Error(errorMessage);
  src = src.replace(anchor, newLines.concat(anchorLines).join("\n"));
}

if (!src.includes('case "getTfgSettlementMember"')) {
  insertBefore_(
    [
      '      case "createTfgSettlement":',
      '        requireAuth_(body, ["ADMIN", "MANAGER"]);',
      '        return createTfgSettlement_(body);'
    ],
    [
      '      case "getTfgSettlementMember":',
      '        requireAuth_(body, ["ADMIN", "MANAGER"]);',
      '        return getTfgSettlementMember_(body);',
      ''
    ],
    "Could not locate createTfgSettlement route in live 99_Main.js"
  );
}

if (!src.includes('case "deferTfgSettlement"')) {
  const approveAnchor = [
    '      case "approveTfgSettlement":',
    '        return approveTfgSettlement_(body);'
  ].join("\n");
  const replacement = [
    '      case "approveTfgSettlement":',
    '        return approveTfgSettlement_(body);',
    '',
    '      case "deferTfgSettlement":',
    '        return deferTfgSettlement_(body);'
  ].join("\n");
  if (!src.includes(approveAnchor)) {
    throw new Error("Could not locate approveTfgSettlement route in live 99_Main.js");
  }
  src = src.replace(approveAnchor, replacement);
}

fs.writeFileSync(path, src);
