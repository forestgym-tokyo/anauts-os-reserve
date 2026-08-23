window.ANAUTS_AUTH = {
  enabled: true,
  firebaseApiKey: "AIzaSyAtxFCPt1mGZWYP6hMYcqeVzLAVmrvvyIc"
};

window.addEventListener("load", function () {
  var monthly = document.createElement("script");
  monthly.src = "./admin-monthly-v58.js?v=20260823-1942";
  document.body.appendChild(monthly);

  var enrollment = document.createElement("script");
  enrollment.src = "./admin-tour-enrollment.js?v=20260823-2150";
  document.body.appendChild(enrollment);

  var polish = document.createElement("script");
  polish.src = "./admin-tour-ui-polish.js?v=20260823-2200";
  document.body.appendChild(polish);
});
