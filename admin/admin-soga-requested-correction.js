(function (root, factory) {
  "use strict";
  const correction = factory();
  if (typeof module === "object" && module.exports) module.exports = correction;
  if (root && root.document) correction.boot(root);
})(typeof window === "undefined" ? null : window, function () {
  "use strict";
  const MONTH = "2026-11";
  const STORE = "SOGA";
  const REQUEST = "20261125-26";
  const STARTS = ["16:15", "17:00", "17:45", "18:30", "19:15", "20:00"];
  const ENDS = ["17:00", "17:45", "18:30", "19:15", "20:00", "20:45"];
  const clean = value => String(value || "").trim();
  const name = value => clean(value).replace(/[\s　]/g, "").replace(/(?:さん|トレーナー)$/, "").toUpperCase();
  const key = row => [row.date, row.start_time, row.staff_code].join("|");
  const isActive = row => row.active !== false && String(row.active).toUpperCase() !== "FALSE";

  function canonical(rows) {
    return rows.map(row => ({
      date: clean(row.date), start_time: clean(row.start_time), end_time: clean(row.end_time),
      staff_code: clean(row.staff_code), assignment_type: row.assignment_type === "TRIAL" ? "TRIAL" : "SHIFT"
    })).sort((a, b) => key(a).localeCompare(key(b)));
  }
  function signature(rows) { return JSON.stringify(canonical(rows)); }
  function resolveStaff(staff, label, match) {
    const matches = staff.filter(row => isActive(row) && match(row));
    if (matches.length !== 1) throw new Error(label + "さんのスタッフ登録を一意に確認できません。変更していません。");
    return clean(matches[0].staff_code);
  }
  function afternoon(row, date) {
    return row.date === date && row.start_time < "20:45" && row.end_time > "16:15";
  }
  function readRows(response) {
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.data?.shifts)) return response.data.shifts;
    throw new Error("シフトの取得結果を確認できません。変更していません。");
  }
  function makePlan(board, shifts) {
    if (!Array.isArray(board?.staff) || !Array.isArray(board.assignments) || !Array.isArray(board.slots)) {
      throw new Error("9ROUNDシフトを取得できません。変更していません。");
    }
    const staff = board.staff;
    const kevin = resolveStaff(staff, "Kevin", row => name(row.staff_code) === "KEVIN" || [row.staff_name, row.display_name].some(value => name(value) === "KEVIN"));
    const kawakami = resolveStaff(staff, "川上一郎", row => [row.staff_name, row.display_name].some(value => name(value) === "川上一郎"));
    const sakaki = resolveStaff(staff, "榊", row => [row.staff_name, row.display_name].some(value => /^榊/.test(name(value))));
    if (new Set([kevin, kawakami, sakaki]).size !== 3) throw new Error("変更対象のスタッフが重複しています。変更していません。");
    STARTS.forEach((start, index) => {
      if (!board.slots.some(row => row.start_time === start && row.end_time === ENDS[index])) {
        throw new Error("16:15〜20:45の勤務枠を確認できません。変更していません。");
      }
    });
    const before = canonical(board.assignments);
    const existing = new Map();
    for (const row of before) {
      if (!row.date.startsWith(MONTH + "-") || !row.staff_code || existing.has(key(row))) {
        throw new Error("月間シフトの内容に不整合があります。変更していません。");
      }
      existing.set(key(row), row);
    }
    const changes = [
      { date: "2026-11-25", from: kevin, to: kawakami },
      { date: "2026-11-26", from: sakaki, to: kevin }
    ];
    const linkedIds = new Set(board.assignments.map(row => clean(row.shift_id)).filter(Boolean));
    const relevant = shifts.filter(row => clean(row.store_code).toUpperCase() === STORE && isActive(row));
    for (const row of relevant) {
      if (changes.some(change => afternoon(row, change.date) && [change.from, change.to].includes(row.staff_code))) {
        if (!linkedIds.has(clean(row.shift_id)) || !STARTS.includes(row.start_time) || ENDS[STARTS.indexOf(row.start_time)] !== row.end_time) {
          throw new Error("対象日の勤務と調整画面が一致しないため、自動変更を止めました。通常の9ROUNDシフト画面で確認してください。");
        }
      }
    }
    const desired = new Map(existing);
    for (const change of changes) {
      STARTS.forEach((start, index) => {
        const oldKey = key({date: change.date, start_time: start, staff_code: change.from});
        const nextKey = key({date: change.date, start_time: start, staff_code: change.to});
        const source = desired.get(oldKey), target = desired.get(nextKey);
        desired.delete(oldKey);
        desired.set(nextKey, {
          date: change.date, start_time: start, end_time: ENDS[index], staff_code: change.to,
          assignment_type: source?.assignment_type === "TRIAL" || target?.assignment_type === "TRIAL" ? "TRIAL" : "SHIFT"
        });
      });
    }
    const assignments = canonical([...desired.values()]);
    // Keep the same scheduling rules as the ordinary monthly adjustment screen.
    const byPerson = new Map();
    for (const row of assignments) {
      if (row.staff_code === kevin && new Date(row.date + "T12:00:00Z").getUTCDay() === 0) {
        throw new Error("Kevinさんの日曜勤務が含まれています。通常の9ROUNDシフト画面で確認してください。変更していません。");
      }
      const person = row.date + "|" + row.staff_code;
      if (!byPerson.has(person)) byPerson.set(person, new Set());
      byPerson.get(person).add(row.start_time);
    }
    for (const starts of byPerson.values()) {
      if (starts.has("17:00") && !starts.has("17:45") && !["10:15", "11:00", "11:45", "12:30", "13:15"].every(start => starts.has(start))) {
        throw new Error("17:45までの担当者は当日の前半も必須です。通常の9ROUNDシフト画面で確認してください。変更していません。");
      }
    }
    const untouchedShifts = relevant.filter(row => !changes.some(change => row.staff_code === change.from && afternoon(row, change.date)));
    return { before, assignments, changes, untouchedShifts, changed: signature(before) !== signature(assignments) };
  }
  function verify(plan, board, shifts) {
    if (signature(board.assignments) !== signature(plan.assignments)) return false;
    const rows = shifts.filter(row => clean(row.store_code).toUpperCase() === STORE && isActive(row));
    if (plan.untouchedShifts.some(before => !rows.some(after => after.shift_id === before.shift_id &&
      after.staff_code === before.staff_code && after.date === before.date &&
      after.start_time === before.start_time && after.end_time === before.end_time))) return false;
    return plan.changes.every(change => {
      if (rows.some(row => row.staff_code === change.from && afternoon(row, change.date))) return false;
      const target = rows.filter(row => row.staff_code === change.to && afternoon(row, change.date));
      return target.length === STARTS.length && STARTS.every((start, index) => target.filter(row => row.start_time === start && row.end_time === ENDS[index]).length === 1);
    });
  }

  function isTransportError(error) {
    return /failed to fetch|fetch failed|networkerror|network request failed|load failed|通信が.+完了しません|タイムアウト/i.test(String(error?.message || "")) ||
      ["AbortError", "TimeoutError"].includes(error?.name);
  }
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  async function retryRead(get, action, params, pause = wait) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await get(action, params); }
      catch (error) {
        // A timed-out GET already waited 60 seconds in the normal API client.
        if (!isTransportError(error) || error?.name === "TimeoutError" || attempt === 2) throw error;
        await pause(500 * (attempt + 1));
      }
    }
  }
  async function readLive(get) {
    const user = await retryRead(get, "getCurrentUser");
    if (String((user.data?.profile || user.data)?.permission).toUpperCase() !== "ADMIN") {
      throw new Error("この変更はADMIN権限のアカウントでログインしてください。");
    }
    // Serialize these reads while the rest of the admin screen is also loading.
    const board = await retryRead(get, "getSogaShiftBoard", {month: MONTH, store_code: STORE});
    const publication = await retryRead(get, "getStaffShiftPublication", {month: MONTH, store_code: STORE});
    const shifts = await retryRead(get, "getStaffShifts", {start_date: "2026-11-25", end_date: "2026-11-26", store_code: STORE});
    if (typeof publication.data?.is_published !== "boolean") throw new Error("公開状態を確認できません。変更していません。");
    return {board: board.data, publication: publication.data, shifts: readRows(shifts)};
  }

  function boot(root) {
    const query = new URLSearchParams(root.location.search);
    if (query.get("sogaShiftCorrection") !== REQUEST) return;
    let panel, status, button, reload, preview, busy = false, restorePublished = query.get("publishCorrection") === "1", pendingPlan = null;
    const get = (...args) => apiGet(...args);
    const post = (...args) => apiPost(...args);
    function message(text, error = false) {
      status.textContent = text;
      status.style.color = "inherit";
      status.style.borderLeft = error ? "3px solid #dc6a51" : "";
      status.style.paddingLeft = error ? "10px" : "";
    }
    function resultText(published) {
      return published ? "変更を確認しました。11月25日後半は川上一郎さん、11月26日後半はKevinさんです。スタッフにも公開済みです。" : "変更を確認しました。11月25日後半は川上一郎さん、11月26日後半はKevinさんです。この月のシフトは公開前の状態を維持しています。";
    }
    async function refresh() {
      if (busy) return;
      busy = true; button.disabled = true; reload.disabled = true;
      message("現在のシフトを確認しています…");
      try {
        const live = await readLive(get);
        if (pendingPlan) {
          if (!verify(pendingPlan, live.board, live.shifts)) {
            preview = null;
            button.textContent = "保存結果の確認待ち";
            message("保存結果をまだ確認できません。変更は再送せず、しばらく待ってから「保存結果を再確認」を押してください。", true);
            return;
          }
          pendingPlan = null;
        }
        const plan = makePlan(live.board, live.shifts);
        preview = {live, plan};
        if (!plan.changed && verify(plan, live.board, live.shifts)) {
          if (!live.publication.is_published) {
            button.textContent = "変更済みのシフトをスタッフへ公開";
            button.disabled = false;
            message("指定の変更は保存済みです。11月分をスタッフへ公開できます。");
          } else {
            button.textContent = "変更済み";
            message(resultText(live.publication.is_published));
          }
        } else {
          button.textContent = live.publication.is_published || restorePublished ? "この2日分を変更して公開" : "この2日分を変更";
          button.disabled = false;
          message(live.publication.is_published || restorePublished ? "変更後に11月分をスタッフへ公開します。" : "変更内容を保存します。この月のシフトは現在、公開前です。");
        }
      } catch (error) {
        preview = null;
        message(isTransportError(error) ? (pendingPlan ? "保存結果の確認中に通信が途切れました。変更は再送せず、「保存結果を再確認」を押してください。" : "シフトの読み込み中に通信が途切れました。「内容を再確認」を押してください。この読み取り確認では変更を送信していません。") : error.message || "内容を確認できませんでした。", true);
      }
      finally { busy = false; reload.disabled = false; reload.textContent = pendingPlan ? "保存結果を再確認" : "内容を再確認"; }
    }
    async function apply() {
      if (busy || !preview) return;
      busy = true; button.disabled = true; reload.disabled = true;
      let phase = "before-save";
      message("最新のシフトを確認しています…");
      try {
        const live = await readLive(get);
        const plan = makePlan(live.board, live.shifts);
        if (signature(live.board.assignments) !== signature(preview.live.board.assignments) || live.publication.is_published !== preview.live.publication.is_published) {
          throw new Error("確認後にシフトが更新されました。「内容を再確認」を押してから変更してください。まだ保存していません。");
        }
        // When changes are already saved, this button explicitly offers publication.
        restorePublished = restorePublished || live.publication.is_published || !plan.changed;
        let saved = live;
        if (plan.changed) {
          message("指定の2日分を保存しています…");
          phase = "save-requested";
          pendingPlan = plan;
          let saveError;
          try { await post({action: "saveSogaShiftAssignments", month: MONTH, store_code: STORE, assignments: plan.assignments}); }
          catch (error) { saveError = error; }
          message("保存結果を確認しています…");
          let confirmed = false, readError;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              saved = await readLive(get);
              if (verify(plan, saved.board, saved.shifts)) { confirmed = true; break; }
            } catch (error) {
              if (!isTransportError(error)) throw error;
              readError = error;
              if (error?.name === "TimeoutError") break;
            }
            if (saveError && !isTransportError(saveError)) break;
            if (attempt < 2) await wait(1000 * (attempt + 1));
          }
          if (!confirmed) {
            if (saveError && !isTransportError(saveError)) {
              pendingPlan = null;
              throw new Error(saveError.message + " 現在のシフトを再確認してください。公開処理は行っていません。");
            }
            if (readError) throw readError;
            throw new Error("保存後の内容が一致しません。保存処理が続いている可能性があります。変更は再送せず、「保存結果を再確認」を押してください。公開処理は行っていません。");
          }
          pendingPlan = null;
          phase = "save-confirmed";
        } else if (!verify(plan, live.board, live.shifts)) {
          throw new Error("勤務データの一致を確認できません。現在のシフトを再確認してください。");
        }
        if (restorePublished && !saved.publication.is_published) {
          message("保存を確認しました。スタッフへ公開しています…");
          phase = "publish-requested";
          // Do not retry a write after a timeout: read the authoritative state instead.
          try { await post({action: "publishStaffShiftMonth", month: MONTH, store_code: STORE}); }
          catch (_) { /* A timed-out request may have committed; verify below. */ }
          saved = await readLive(get);
          if (!verify(plan, saved.board, saved.shifts)) throw new Error("公開後の内容が変わっています。現在のシフトを再確認してください。");
          if (!saved.publication.is_published) throw new Error("変更は保存済みですが、スタッフへの公開を確認できません。「内容を再確認」から公開を再開してください。");
        }
        restorePublished = false;
        preview = {live: saved, plan};
        button.textContent = "変更済み";
        if (typeof clearFastLocalCaches_ === "function") clearFastLocalCaches_();
        message(resultText(saved.publication.is_published));
      } catch (error) {
        let text = error.message || "変更結果を確認できません。内容を再確認してください。";
        if (isTransportError(error)) {
          text = phase === "before-save" ? "保存前の確認中に通信が途切れました。変更はまだ送信していません。「内容を再確認」を押してください。" :
            phase === "publish-requested" ? "変更の保存は確認済みですが、公開結果を確認する通信が途切れました。「内容を再確認」を押してください。保存はやり直しません。" :
            "保存結果の確認中に通信が途切れました。変更は再送せず、「保存結果を再確認」を押してください。";
        }
        message(text, true);
      }
      finally { busy = false; reload.disabled = false; reload.textContent = pendingPlan ? "保存結果を再確認" : "内容を再確認"; }
    }
    function mount() {
      if (panel) return;
      const main = root.document.querySelector("main.main");
      if (!main) return;
      panel = root.document.createElement("section");
      panel.className = "card"; panel.id = "sogaRequestedCorrection";
      panel.style.cssText = "padding:24px;margin-bottom:24px;border:2px solid #79dc8c;scroll-margin-top:100px";
      panel.innerHTML = '<h1 style="font-size:24px;margin-top:0">9ROUND シフト変更</h1>' +
        '<p>2026年11月・後半 16:15〜20:45（日本時間）</p>' +
        '<div style="overflow:auto"><table class="data-table" style="width:100%;max-width:620px;text-align:left;line-height:1.7"><thead><tr><th>日付</th><th>外す担当</th><th>入れる担当</th></tr></thead>' +
        '<tbody><tr><td>11月25日（水）</td><td>Kevin</td><td>川上一郎</td></tr><tr><td>11月26日（木）</td><td>榊</td><td>Kevin</td></tr></tbody></table></div>' +
        '<p>榊さんを外すのは11月26日の後半です。</p>' +
        '<p id="sogaCorrectionStatus" role="status" aria-live="polite">内容を確認しています…</p>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap"><button id="sogaCorrectionApply" type="button" class="primary-button" disabled>内容を確認中…</button>' +
        '<button id="sogaCorrectionReload" type="button" class="ghost-button">内容を再確認</button></div>';
      main.prepend(panel);
      status = panel.querySelector("#sogaCorrectionStatus");
      button = panel.querySelector("#sogaCorrectionApply");
      reload = panel.querySelector("#sogaCorrectionReload");
      button.onclick = apply; reload.onclick = refresh;
      panel.scrollIntoView({block: "start"});
      refresh();
    }
    let checks = 0;
    function ready() {
      if (typeof state !== "undefined" && state.authUser && typeof apiGet === "function" && typeof apiPost === "function") { mount(); return; }
      if (checks++ < 900) root.setTimeout(ready, 1000);
    }
    root.addEventListener("anauts:admin-core-ready", ready);
    ready();
  }
  return {canonical, signature, makePlan, verify, isTransportError, retryRead, readLive, boot};
});
