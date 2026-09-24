const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../admin/admin-monthly-v58.js"), "utf8");
function extract(name) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?^    \\}`, "m"));
  assert.ok(match, `${name} is defined`);
  return match[0];
}

test("October SOGA print opens a white, single-page A4 landscape document with all 66 shifts", async () => {
  let html = "";
  let printCalls = 0;
  const printDoc = {
    fonts: { ready: Promise.resolve() },
    open() {},
    write(value) { html = value; },
    close() {},
    querySelector(selector) {
      if (selector === "#printNow") return { onclick: null };
      if (selector === "#monthlyPrintSheet") return { querySelectorAll: () => [] };
      throw new Error(`Unexpected selector: ${selector}`);
    }
  };
  const popup = {
    document: printDoc,
    closed: false,
    focus() {},
    requestAnimationFrame(callback) { callback(); },
    print() { printCalls++; }
  };
  const rows = [];
  for (let day = 1; day <= 31; day++) {
    for (let number = 0; number < (day <= 4 ? 3 : 2); number++) {
      rows.push({store_code:"SOGA",date:`2026-10-${String(day).padStart(2,"0")}`,start_time:"10:15",end_time:"14:00",staff_code:day===1&&number===0?"SPECIAL":"KAWAKAMI"});
    }
  }
  assert.equal(rows.length, 66);
  rows.push({store_code:"YACHIYO",date:"2026-10-01",start_time:"10:15",end_time:"14:00",staff_code:"OTHER"});
  const scope = vm.createContext({
    monthlyLoadedMonth_:"2026-10",
    state:{authUser:{permission:"MANAGER"},monthlyMonth:"2026-10",monthlyRows:rows,staff:[{staff_code:"SPECIAL",display_name:"小澤 <まなみ>"},{staff_code:"KAWAKAMI",display_name:"川上"},{staff_code:"OTHER",display_name:"他店"}]},
    canPrintMonthly_:()=>true,
    sogaStaffRestricted_:()=>false,
    document:{querySelector:selector=>selector==="#mStore"?{value:"SOGA"}:null},
    window:{open:()=>popup},
    storeLabel_:()=>"9ROUND アリオ蘇我店",
    esc:value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
    alert:message=>{throw new Error(message)}
  });
  vm.runInContext(["monthlyPrintCss_","fitMonthlyPrintCells_","printMonth_"].map(extract).join("\n")+"\nprintMonth_()",scope);
  await new Promise(setImmediate);

  assert.equal(printCalls,1);
  assert.match(html, /@page\{size:A4 landscape;margin:8mm\}/);
  assert.match(html, /color-scheme:light;background:#fff/);
  assert.match(html, /#monthlyPrintSheet\{width:270mm;height:180mm/);
  assert.match(html, /\.print-grid\{height:164mm/);
  assert.match(html, /\.print-actions\{display:none!important\}/);
  assert.equal((html.match(/class="print-shift"/g)||[]).length,66);
  assert.match(html,/小澤 &lt;まなみ&gt;/);
  assert.doesNotMatch(html,/他店|#090d0a/);
  assert.equal(270+8*2<297,true,"horizontal print margins fit A4");
  assert.equal(180+8*2<210,true,"vertical print margins fit A4");
  assert.equal(10+6+164,180,"calendar elements fit the print sheet");
});
