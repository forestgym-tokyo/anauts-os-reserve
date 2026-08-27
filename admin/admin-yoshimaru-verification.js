/* A-nauts OS Reserve - Yoshimaru customer eligibility staff confirmation */
(()=>{
  "use strict";

  if(window.__ANAUTS_YOSHIMARU_VERIFY__)return;
  window.__ANAUTS_YOSHIMARU_VERIFY__=true;

  const GET_ACTION="getPendingYoshimaruVerifications";
  const POST_ACTION="verifyYoshimaruCustomer";
  let refreshTimer=null;
  let authObserver=null;
  let loading=false;

  const esc=v=>String(v??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  function authReady(){
    try{
      return typeof state!=="undefined" && !!state?.authUser;
    }catch(_){
      return false;
    }
  }

  function ensureStyles(){
    if(document.getElementById("yoshimaruVerifyStyle"))return;
    const style=document.createElement("style");
    style.id="yoshimaruVerifyStyle";
    style.textContent=`
      .ygv-launch{position:fixed;right:18px;bottom:18px;z-index:9990;display:none;align-items:center;gap:8px;min-height:46px;padding:10px 15px;border:1px solid #d9b85d;border-radius:999px;background:#102219;color:#fff;font:inherit;font-weight:900;box-shadow:0 10px 28px rgba(0,0,0,.35);cursor:pointer}
      .ygv-launch.is-visible{display:inline-flex}.ygv-badge{display:none;min-width:22px;height:22px;align-items:center;justify-content:center;padding:0 6px;border-radius:999px;background:#d9b85d;color:#07110d;font-size:12px}.ygv-badge.is-visible{display:inline-flex}
      .ygv-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.72)}
      .ygv-modal{width:min(660px,100%);max-height:86vh;overflow:auto;border:1px solid rgba(255,255,255,.16);border-radius:18px;background:#0d1c16;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.45)}
      .ygv-head{position:sticky;top:0;z-index:1;padding:20px 22px 14px;border-bottom:1px solid rgba(255,255,255,.12);background:#0d1c16}.ygv-head h2{margin:0 0 6px;font-size:20px}.ygv-head p{margin:0;color:#aebbb2;font-size:13px;line-height:1.6}
      .ygv-body{padding:16px 22px 22px}.ygv-list{display:grid;gap:10px}.ygv-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:14px;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:rgba(255,255,255,.03)}
      .ygv-row strong{display:block;margin-bottom:5px;font-size:15px}.ygv-meta{font-size:12px;line-height:1.65;color:#aebbb2}.ygv-confirm{min-height:40px;padding:8px 12px;border:1px solid #d9b85d;border-radius:10px;background:rgba(217,184,93,.15);color:#fff;font:inherit;font-weight:900;cursor:pointer}.ygv-confirm:disabled{opacity:.55;cursor:default}
      .ygv-empty{padding:24px 12px;text-align:center;color:#aebbb2}.ygv-message{min-height:20px;margin-bottom:10px;color:#ffcf7d;font-size:13px}.ygv-actions{display:flex;justify-content:flex-end;padding:0 22px 20px}.ygv-close{min-height:40px}
      @media(max-width:620px){.ygv-row{grid-template-columns:1fr}.ygv-confirm{width:100%}.ygv-launch{right:12px;bottom:12px}.ygv-modal{max-height:90vh}.ygv-actions .ghost-button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureLauncher(){
    ensureStyles();
    let button=document.getElementById("yoshimaruVerifyLauncher");
    if(button)return button;
    button=document.createElement("button");
    button.id="yoshimaruVerifyLauncher";
    button.type="button";
    button.className="ygv-launch";
    button.innerHTML=`<span>吉丸 初回確認</span><span id="yoshimaruVerifyBadge" class="ygv-badge"></span>`;
    button.addEventListener("click",openModal);
    document.body.appendChild(button);
    return button;
  }

  function setCount(count){
    const badge=document.getElementById("yoshimaruVerifyBadge");
    if(!badge)return;
    const n=Number(count)||0;
    badge.textContent=String(n);
    badge.classList.toggle("is-visible",n>0);
  }

  async function fetchPending(){
    if(typeof apiGet!=="function")throw new Error("管理画面APIを利用できません。");
    const result=await apiGet(GET_ACTION,{});
    return Array.isArray(result?.data?.pending)?result.data.pending:[];
  }

  async function refreshCount(){
    const launcher=ensureLauncher();
    const ready=authReady();
    launcher.classList.toggle("is-visible",ready);
    if(!ready){setCount(0);return;}
    try{
      const rows=await fetchPending();
      setCount(rows.length);
    }catch(_){
      // 管理画面本体を妨げない。
    }
  }

  function closeModal(){
    document.getElementById("yoshimaruVerifyOverlay")?.remove();
  }

  function rowHtml(r){
    const name=String(r?.customer_name||"お客様").trim();
    const date=String(r?.reservation_date||r?.date||"").trim();
    const start=String(r?.start_time||"").slice(0,5);
    const service=String(r?.service_name||r?.service_code||"パーソナル").trim();
    return `
      <div class="ygv-row" data-reservation-id="${esc(r?.reservation_id||"")}">
        <div>
          <strong>${esc(name)}</strong>
          <div class="ygv-meta">${esc(date)} ${esc(start)} / ${esc(service)}<br>吉丸りなトレーナー：女性専用の初回確認待ち</div>
        </div>
        <button type="button" class="ygv-confirm">確認済みにする</button>
      </div>`;
  }

  async function openModal(){
    if(loading)return;
    loading=true;
    closeModal();
    ensureStyles();

    const overlay=document.createElement("div");
    overlay.id="yoshimaruVerifyOverlay";
    overlay.className="ygv-overlay";
    overlay.innerHTML=`
      <div class="ygv-modal" role="dialog" aria-modal="true" aria-label="吉丸トレーナー初回確認">
        <div class="ygv-head">
          <h2>吉丸トレーナー 初回確認</h2>
          <p>来店時に女性専用の利用条件をスタッフが確認した方だけ「確認済み」にしてください。確認済み後は次回以降、性別質問を表示しません。</p>
        </div>
        <div class="ygv-body"><div id="ygvMessage" class="ygv-message">読み込んでいます…</div><div id="ygvList" class="ygv-list"></div></div>
        <div class="ygv-actions"><button type="button" id="ygvClose" class="ghost-button ygv-close">閉じる</button></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeModal();});
    overlay.querySelector("#ygvClose").onclick=closeModal;

    const message=overlay.querySelector("#ygvMessage");
    const list=overlay.querySelector("#ygvList");

    try{
      const rows=await fetchPending();
      setCount(rows.length);
      message.textContent="";
      list.innerHTML=rows.length?rows.map(rowHtml).join(""):`<div class="ygv-empty">現在、確認待ちの予約はありません。</div>`;

      list.querySelectorAll(".ygv-confirm").forEach(button=>{
        button.addEventListener("click",async()=>{
          const row=button.closest("[data-reservation-id]");
          const reservationId=String(row?.dataset?.reservationId||"").trim();
          const customer=String(row?.querySelector("strong")?.textContent||"お客様").trim();
          if(!reservationId)return;

          const ok=confirm(
            `${customer}さんについて、吉丸りなトレーナーの女性専用利用条件を来店時に確認しましたか？\n\n`+
            `「OK」を押すと、次回以降は性別確認なしで予約できるようになります。`
          );
          if(!ok)return;

          button.disabled=true;
          button.textContent="登録中…";
          message.textContent="";

          try{
            if(typeof apiPost!=="function")throw new Error("管理画面APIを利用できません。");
            await apiPost({action:POST_ACTION,reservation_id:reservationId});
            row.remove();
            const remain=list.querySelectorAll("[data-reservation-id]").length;
            setCount(remain);
            if(!remain)list.innerHTML=`<div class="ygv-empty">現在、確認待ちの予約はありません。</div>`;
            message.textContent=`${customer}さんを確認済みにしました。`;
          }catch(error){
            button.disabled=false;
            button.textContent="確認済みにする";
            message.textContent=error?.message||"確認済み登録に失敗しました。";
          }
        });
      });
    }catch(error){
      message.textContent=error?.message||"確認待ち一覧を取得できませんでした。";
      list.innerHTML="";
    }finally{
      loading=false;
    }
  }

  function watchAuthState(){
    const authArea=document.getElementById("authUserArea");
    if(!authArea||authObserver)return;
    authObserver=new MutationObserver(()=>refreshCount());
    authObserver.observe(authArea,{attributes:true,attributeFilter:["class"]});
  }

  function start(){
    ensureLauncher();
    watchAuthState();
    refreshCount();
    clearInterval(refreshTimer);
    refreshTimer=setInterval(refreshCount,60000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
