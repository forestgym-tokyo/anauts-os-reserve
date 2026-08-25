window.ANAUTS_AUTH = {
  enabled: true,
  firebaseApiKey: "AIzaSyAtxFCPt1mGZWYP6hMYcqeVzLAVmrvvyIc"
};

window.addEventListener("load", function () {
  function load(src){
    var s=document.createElement("script");
    s.src=src;
    document.body.appendChild(s);
  }
  load("./admin-monthly-v58.js?v=20260823-1942");
  load("./admin-tour-enrollment.js?v=20260825-1215");
  load("./admin-tour-startdate-fix.js?v=20260825-1235");
  load("./admin-tour-ui-polish.js?v=20260825-1045");
  load("./admin-questionnaire-fix.js?v=20260825-1205");
  /* Always request the current self-shift controller, bypassing the stale child-script cache. */
  load("./admin-myshift-v3.js?v=" + Date.now());
});
