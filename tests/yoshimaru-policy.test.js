const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "gas", "59_YoshimaruGender.gs"),
  "utf8"
);

const members = {
  "000001": { memberNo: "000001", email: "female@example.com", gender: "F" },
  "000002": { memberNo: "000002", email: "male@example.com", gender: "M" },
  "000003": { memberNo: "000003", email: "blank@example.com", gender: "" }
};

const services = {
  PT60: { service_code: "PT60", category: "PERSONAL" },
  PT_TRIAL60: { service_code: "PT_TRIAL60", category: "PERSONAL" },
  PERSONAL_CUSTOM: { service_code: "PERSONAL_CUSTOM", category: "PERSONAL" },
  TOUR: { service_code: "TOUR", category: "VISIT" }
};

function createContext() {
  const created = [];
  const context = {
    console,
    created,
    successResponse(data, message) {
      return { ok: true, message: message || "", data };
    },
    errorResponse(message, code, detail) {
      return { ok: false, message, code, detail };
    },
    createReservation(params) {
      created.push({ ...params });
      return { ok: true, data: { reservation_id: "TEST" } };
    },
    validateReservationMemberMaster_({ memberNo, customerEmail }) {
      const member = members[memberNo];
      if (!member) {
        return { ok: false, code: "MEMBER_NOT_FOUND", message: "会員が見つかりません。" };
      }
      if (member.email.toLowerCase() !== String(customerEmail || "").toLowerCase()) {
        return { ok: false, code: "MEMBER_EMAIL_MISMATCH", message: "メールが一致しません。" };
      }
      return { ok: true, member };
    },
    findReservationMemberByNo_(memberNo) {
      return members[memberNo] || null;
    },
    getAvailabilityService_(serviceCode) {
      return services[serviceCode] || null;
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "59_YoshimaruGender.gs" });
  return context;
}

function reserve(context, overrides) {
  return context.createReservationWithTrainerPolicy_({
    service_code: "PT60",
    member_no: "000001",
    customer_email: "female@example.com",
    ...overrides
  });
}

{
  const context = createContext();
  const result = reserve(context, { staff_code: "" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "PERSONAL_TRAINER_REQUIRED");
  assert.equal(context.created.length, 0);
}

{
  const context = createContext();
  const result = reserve(context, { service_code: "PERSONAL_CUSTOM", staff_code: "" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "PERSONAL_TRAINER_REQUIRED");
  assert.equal(context.created.length, 0);
}

{
  const context = createContext();
  const result = reserve(context, { service_code: "PT_TRIAL60", staff_code: "" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "PERSONAL_TRAINER_REQUIRED");
  assert.equal(context.created.length, 0);
}

{
  const context = createContext();
  const result = reserve(context, { service_code: "TOUR", staff_code: "" });
  assert.equal(result.ok, true);
  assert.equal(context.created.length, 1);
}

{
  const context = createContext();
  const result = reserve(context, {
    staff_code: "YOSHIMARU",
    member_no: "000002",
    customer_email: "male@example.com"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "YOSHIMARU_FEMALE_ONLY");
  assert.equal(context.created.length, 0);
}

{
  const context = createContext();
  const result = reserve(context, {
    staff_code: "OTHER_TRAINER",
    member_no: "000002",
    customer_email: "male@example.com"
  });
  assert.equal(result.ok, true);
  assert.equal(context.created.length, 1);
}

{
  const context = createContext();
  const result = reserve(context, { staff_code: "YOSHIMARU" });
  assert.equal(result.ok, true);
  assert.equal(context.created.length, 1);
}

{
  const context = createContext();
  const missing = reserve(context, {
    staff_code: "YOSHIMARU",
    member_no: "000003",
    customer_email: "blank@example.com"
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "YOSHIMARU_GENDER_REQUIRED");

  const female = reserve(context, {
    staff_code: "YOSHIMARU",
    member_no: "000003",
    customer_email: "blank@example.com",
    gender: "女性"
  });
  assert.equal(female.ok, true);
  assert.equal(context.created.length, 1);
}

{
  const context = createContext();
  const result = reserve(context, {
    policy_check_only: true,
    staff_code: "YOSHIMARU",
    member_no: "000002",
    customer_email: "male@example.com"
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.gender_state, "MALE");
  assert.equal(context.created.length, 0);
}

console.log("yoshimaru-policy tests passed");
