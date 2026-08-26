(()=>{
  "use strict";
  function boot(){
    if(typeof apiPost!=="function"||typeof window.ANAUTS_OPS_GO_TO_SCHEDULE!=="function"){
      setTimeout(boot,100);
      return;
    }
    if(apiPost.__opsRefreshFix)return;
    const previous=apiPost;
    const wrapped=async function(payload){
      const result=await previous(payload);
      if(payload?.action==="saveStaff"||payload?.action==="saveService"){
        setTimeout(()=>location.reload(),450);
      }
      return result;
    };
    wrapped.__opsRefreshFix=true;
    apiPost=wrapped;
  }
  boot();
})();