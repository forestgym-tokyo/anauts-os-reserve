const APP_CONFIG = Object.freeze({
  APP_NAME: "A-nauts OS Reserve",
  VERSION: "1.0.0",
  TIMEZONE: "Asia/Tokyo",

  SHEETS: Object.freeze({
    BRANDS: "brands",
    STORES: "stores",
    SERVICES: "services",
    STAFF: "staff",
    STAFF_SHIFTS: "staff_shifts",
    SERVICE_HOURS: "service_hours",
    MAIL_ACCOUNTS: "mail_accounts",
    CALENDARS: "calendars",
    RESERVATIONS: "reservations",
    RESERVATION_HISTORIES: "reservation_histories",
    SYSTEM_LOGS: "system_logs",
    SETTINGS: "settings"
  }),

  STATUS: Object.freeze({
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE"
  }),

  RESERVATION_STATUS: Object.freeze({
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED"
  }),

  CATEGORY: Object.freeze({
    GENERAL: "GENERAL",
    PERSONAL: "PERSONAL",
    INTERNAL: "INTERNAL"
  }),

  FORM_TYPE: Object.freeze({
    GENERAL_CUSTOMER: "GENERAL_CUSTOMER",
    MEMBER_VERIFIED: "MEMBER_VERIFIED",
    INTERNAL: "INTERNAL"
  })
});