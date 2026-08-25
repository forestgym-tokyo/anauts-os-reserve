window.ANAUTS_AUTH = {
  enabled: true,
  firebaseApiKey: "AIzaSyAtxFCPt1mGZWYP6hMYcqeVzLAVmrvvyIc"
};

window.addEventListener("load", function () {
  var monthly = document.createElement("script");
  monthly.src = "./admin-monthly-v58.js?v=20260823-1942";
  document.body.appendChild(monthly);

  var enrollment = document.createElement("script");
  enrollment.src = "./admin-tour-enrollment.js?v=20260825-1045";
  document.body.appendChild(enrollment);

  var polish = document.createElement("script");
  polish.src = "./admin-tour-ui-polish.js?v=20260825-1045";
  document.body.appendChild(polish);

  var questionnaireFix = document.createElement("script");
  questionnaireFix.src = "./admin-questionnaire-fix.js?v=20260825-1158";
  document.body.appendChild(questionnaireFix);
});
