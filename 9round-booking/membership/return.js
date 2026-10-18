(function () {
  "use strict";
  // A return URL is not evidence of card registration or payment. Future integration
  // must retrieve the provider's result on the server before displaying success.
  if (window.location.search || window.location.hash) window.history.replaceState(null, "", window.location.pathname);
})();
