window.ANAUTS_AUTH = {
  enabled: true,
  firebaseApiKey: "AIzaSyAtxFCPt1mGZWYP6hMYcqeVzLAVmrvvyIc"
};

window.addEventListener("load", function () {
  var s = document.createElement("script");
  s.src = "./admin-v57.js?v=20260823-1";
  s.defer = true;
  document.body.appendChild(s);
});
