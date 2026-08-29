const fs=require('fs');
const assert=require('assert');

const fast=fs.readFileSync('gas/46_1_TourQuestionnairePrintFast.gs','utf8');
const cache=fs.readFileSync('gas/46_2_TourQuestionnaireCache.gs','utf8');
const main=fs.readFileSync('gas/99_Main.gs','utf8');

assert.match(cache,/function primeTourQuestionnaireCacheFromSchedule_\s*\(/,'staff schedule must prebuild questionnaire payloads');
assert.match(cache,/\["FULL", "ADDRESS_ONLY", "BLANK"\]/,'all three print modes must be prebuilt');
assert.match(cache,/buildTourInstantPrintPayload_\(reservation, printMode\)/,'prebuild must use the exact existing GAS payload builder');
assert.match(fast,/getTourQuestionnaireCachedPayload_\(reservationId, printMode\)/,'print action must use cache before reading reservations');

const cacheCheck=fast.indexOf('getTourQuestionnaireCachedPayload_(reservationId, printMode)');
const sheetLookup=fast.indexOf('findReservationRowById_(reservationId)');
assert.ok(cacheCheck>=0 && sheetLookup>=0 && cacheCheck<sheetLookup,'cache lookup must happen before reservation sheet lookup');

assert.match(main,/case "getCurrentUser"[\s\S]*?getCurrentUserWithQuestionnaireCache_\(/,'login bootstrap must prime cache');
assert.match(main,/case "getStaffSchedule"[\s\S]*?getStaffScheduleWithQuestionnaireCache_\(/,'date navigation must prime cache');
assert.match(main,/case "generateTourQuestionnairePdf"[\s\S]*?requireQuestionnaireAuthFast_\(/,'questionnaire click must use warmed auth cache');
assert.match(main,/case "updateTourCustomerAddress"[\s\S]*?clearTourQuestionnaireCache_\(/,'address correction must invalidate cached payloads');

assert.doesNotMatch(cache,/left:|top:|font-size:|questionnaire-print\.html.*style/i,'cache layer must not alter print layout');
console.log('tour questionnaire prefetch cache checks passed');
