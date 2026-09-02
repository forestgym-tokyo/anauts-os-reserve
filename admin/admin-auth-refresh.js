(()=>{
  "use strict";

  const REFRESH_TOKEN_KEY="anauts_refresh_token";
  const EXPIRES_AT_KEY="anauts_id_token_expires_at";
  const REFRESH_MARGIN_MS=5*60*1000;
  let refreshPromise=null;

  function tokenExpiresAt_(token){
    try{
      const part=String(token||"").split(".")[1]||"";
      const normalized=part.replace(/-/g,"+").replace(/_/g,"/");
      const padded=normalized+"=".repeat((4-normalized.length%4)%4);
      const payload=JSON.parse(atob(padded));
      return Number(payload.exp||0)*1000;
    }catch(_){
      return 0;
    }
  }

  function storedExpiresAt_(token){
    const saved=Number(sessionStorage.getItem(EXPIRES_AT_KEY)||0);
    return saved||tokenExpiresAt_(token);
  }

  function saveAuthResult_(result){
    const idToken=String(result?.idToken||result?.id_token||"").trim();
    const refreshToken=String(result?.refreshToken||result?.refresh_token||"").trim();
    const expiresIn=Number(result?.expiresIn||result?.expires_in||0);

    if(idToken){
      state.idToken=idToken;
      sessionStorage.setItem("anauts_id_token",idToken);
      const expiresAt=expiresIn>0?Date.now()+expiresIn*1000:tokenExpiresAt_(idToken);
      if(expiresAt)sessionStorage.setItem(EXPIRES_AT_KEY,String(expiresAt));
    }
    if(refreshToken)sessionStorage.setItem(REFRESH_TOKEN_KEY,refreshToken);
  }

  function clearRefreshSession_(){
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_AT_KEY);
  }

  async function requestRefresh_(refreshToken){
    const key=String(window.ANAUTS_AUTH?.firebaseApiKey||"").trim();
    if(!key)throw new Error("Firebase APIキーが設定されていません。");

    const response=await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(key)}`,
      {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
        body:new URLSearchParams({
          grant_type:"refresh_token",
          refresh_token:refreshToken
        }).toString()
      }
    );
    const json=await response.json();
    if(!response.ok||!json.id_token){
      throw new Error("ログインの更新に失敗しました。再度ログインしてください。");
    }
    saveAuthResult_(json);
    return true;
  }

  async function ensureFreshAuthToken_(force){
    if(typeof state==="undefined"||typeof authEnabled!=="function"||!authEnabled())return false;
    const token=String(state.idToken||sessionStorage.getItem("anauts_id_token")||"").trim();
    if(!token)return false;

    const expiresAt=storedExpiresAt_(token);
    if(!force&&(!expiresAt||expiresAt>Date.now()+REFRESH_MARGIN_MS))return false;

    const refreshToken=String(sessionStorage.getItem(REFRESH_TOKEN_KEY)||"").trim();
    if(!refreshToken){
      throw new Error("ログインの有効期限が切れました。入力内容を残したまま、別タブで再度ログインしてください。");
    }
    if(refreshPromise)return refreshPromise;

    refreshPromise=requestRefresh_(refreshToken).finally(()=>{refreshPromise=null;});
    return refreshPromise;
  }

  function isExpiredAuthError_(error){
    const message=String(error?.message||error||"");
    return message.includes("ログイン情報が無効または期限切れ")||
      message.includes("ログインが必要")||
      message.includes("IDトークン")||
      message.includes("認証トークン");
  }

  function wrapApi_(original){
    return async function(){
      await ensureFreshAuthToken_(false);
      try{
        return await original.apply(this,arguments);
      }catch(error){
        if(!isExpiredAuthError_(error))throw error;
        await ensureFreshAuthToken_(true);
        return original.apply(this,arguments);
      }
    };
  }

  function install_(){
    if(
      typeof state==="undefined"||
      typeof apiGet!=="function"||
      typeof apiPost!=="function"||
      typeof firebaseSignIn!=="function"||
      typeof restoreAuthSession!=="function"
    ){
      window.setTimeout(install_,50);
      return;
    }
    if(window.__ANAUTS_AUTH_REFRESH_INSTALLED__)return;
    window.__ANAUTS_AUTH_REFRESH_INSTALLED__=true;

    const originalSignIn=firebaseSignIn;
    firebaseSignIn=async function(){
      const result=await originalSignIn.apply(this,arguments);
      saveAuthResult_(result);
      return result;
    };

    const originalRestore=restoreAuthSession;
    restoreAuthSession=async function(){
      const restored=await originalRestore.apply(this,arguments);
      if(!restored)clearRefreshSession_();
      return restored;
    };

    if(typeof firebaseChangePassword==="function"){
      const originalChangePassword=firebaseChangePassword;
      firebaseChangePassword=async function(){
        const result=await originalChangePassword.apply(this,arguments);
        saveAuthResult_(result);
        return result;
      };
    }

    if(typeof logout==="function"){
      const originalLogout=logout;
      logout=function(){
        clearRefreshSession_();
        return originalLogout.apply(this,arguments);
      };
    }

    apiGet=wrapApi_(apiGet);
    apiPost=wrapApi_(apiPost);
    window.ANAUTS_ENSURE_FRESH_AUTH_TOKEN=ensureFreshAuthToken_;
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",install_);
  }else{
    install_();
  }
})();
