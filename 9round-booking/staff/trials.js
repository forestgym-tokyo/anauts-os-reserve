(function () {
  "use strict";
  const auth = window.NineRoundStaff;
  if (!auth) return;
  let dialog, content, message, close, busy = false, selected = null, sequence = 0;
  function el(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
  function eligible() { return !!auth.idToken && auth.canManageBookings === true; }
  function reset() { sequence++; busy = false; selected = null; if (dialog) dialog.close(); if (content) content.replaceChildren(); }
  function mount(parent) {
    if (dialog) return;
    dialog = el("dialog", undefined, "nr-trial-dialog"); dialog.setAttribute("aria-labelledby", "nrTrialDialogTitle");
    const heading = el("h2", "無料体験予約"); heading.id = "nrTrialDialogTitle";
    content = el("div"); message = el("p"); message.setAttribute("role", "status"); close = el("button", "閉じる"); close.type = "button";
    close.onclick = function () { if (!busy) reset(); };
    dialog.addEventListener("cancel", function (e) { if (busy) e.preventDefault(); });
    dialog.append(heading, content, message, close); parent.append(dialog);
  }
  async function mutate(cancel, slot) {
    if (!eligible() || busy || !selected) return;
    const own = ++sequence, generation = auth.generation; busy = true; close.hidden = true;
    content.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    message.textContent = cancel ? "キャンセルしています。" : "体験日時を変更しています…";
    try {
      await auth.request(cancel ? "cancel9RoundManagedTrialBooking" : "reschedule9RoundManagedTrialBooking", Object.assign({ application_id: selected.application_id }, slot ? { date: slot.date, slot_id: slot.slot_id } : {}));
      if (own !== sequence || generation !== auth.generation || !eligible()) return;
      content.replaceChildren(); message.textContent = cancel ? "キャンセルが完了しました。" : "体験日時を変更しました。";
      if (auth.reloadBoard) await auth.reloadBoard();
    } catch (error) { if (own === sequence && generation === auth.generation) message.textContent = error.message; }
    finally { if (own === sequence && generation === auth.generation) { busy = false; close.hidden = false; } }
  }
  async function open(applicationId, intent) {
    if (!eligible() || busy || !dialog) return;
    reset(); const own = ++sequence, generation = auth.generation; busy = true; close.hidden = true;
    message.textContent = "体験予約を確認しています…"; dialog.showModal();
    try {
      const data = await auth.request("get9RoundManagedTrialBooking", { application_id: applicationId });
      if (own !== sequence || generation !== auth.generation || !eligible()) return;
      selected = data;
      content.append(el("p", data.name + " 様 / " + data.party_size + "名"), el("p", data.date + " " + data.start_time + " 開始"), el("p", data.email), el("p", data.phone));
      busy = false;
      if (intent === "cancel") { await mutate(true); return; }
      const schedule = await auth.request("get9RoundTrialSlots", {});
      if (own !== sequence || generation !== auth.generation || !eligible()) return;
      const grid = el("div", undefined, "nr-trial-change-slots");
      schedule.slots.filter(function (s) { return s.available && s.remaining >= data.party_size && s.slot_id !== data.slot_id; }).forEach(function (slot) {
        const button = el("button", slot.date + " " + slot.start_time); button.type = "button";
        button.onclick = function () { mutate(false, slot); }; grid.append(button);
      });
      content.append(grid); message.textContent = grid.childElementCount ? "変更先をタップすると確定します。" : "現在、変更できる体験枠はありません。";
    } catch (error) { if (own === sequence && generation === auth.generation) message.textContent = error.message; }
    finally { if (own === sequence && generation === auth.generation) { busy = false; close.hidden = false; } }
  }
  window.NineRoundTrialActions = { mount: mount, open: open, reset: reset };
})();
