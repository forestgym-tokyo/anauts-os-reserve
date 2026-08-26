window.ANAUTS_AUTH = {
  enabled: true,
  firebaseApiKey: "AIzaSyAtxFCPt1mGZWYP6hMYcqeVzLAVmrvvyIc"
};

window.addEventListener("load", function () {
  var monthly = document.createElement("script");
  monthly.src = "./admin-monthly-v58.js?v=20260825-1556";
  document.body.appendChild(monthly);

  var enrollment = document.createElement("script");
  enrollment.src = "./admin-tour-enrollment.js?v=20260825-1045";
  document.body.appendChild(enrollment);

  var startDateFix = document.createElement("script");
  startDateFix.src = "./admin-tour-startdate-fix.js?v=20260825-1440";
  document.body.appendChild(startDateFix);

  var polish = document.createElement("script");
  polish.src = "./admin-tour-ui-polish.js?v=20260825-1045";
  document.body.appendChild(polish);

  var questionnaireFix = document.createElement("script");
  questionnaireFix.src = "./admin-questionnaire-fix.js?v=20260825-1158";
  document.body.appendChild(questionnaireFix);

  var eventCalendar = document.createElement("script");
  eventCalendar.src = "./admin-event-calendar.js?v=20260825-2047";
  document.body.appendChild(eventCalendar);

  var withdrawalLink = document.createElement("script");
  withdrawalLink.src = "./admin-withdrawal-link.js?v=20260825-2103";
  document.body.appendChild(withdrawalLink);

  var calendarLayout = document.createElement("script");
  calendarLayout.src = "./admin-ui-calendar-layout.js?v=20260825-2125";
  document.body.appendChild(calendarLayout);

  var dailyReport = document.createElement("script");
  dailyReport.src = "./admin-daily-report.js?v=20260825-2142";
  document.body.appendChild(dailyReport);

  var operationsCenter = document.createElement("script");
  operationsCenter.src = "./admin-operations-center.js?v=20260826-1030";
  document.body.appendChild(operationsCenter);

  var operationsRefreshFix = document.createElement("script");
  operationsRefreshFix.src = "./admin-operations-refresh-fix.js?v=20260826-1040";
  document.body.appendChild(operationsRefreshFix);

  var internalReservationBridge = document.createElement("script");
  internalReservationBridge.src = "./admin-reservation-internal-bridge.js?v=20260826-1055";
  document.body.appendChild(internalReservationBridge);

  var scheduleReassignFix = document.createElement("script");
  scheduleReassignFix.src = "./admin-schedule-reassign-fix.js?v=20260826-1148";
  document.body.appendChild(scheduleReassignFix);
});
