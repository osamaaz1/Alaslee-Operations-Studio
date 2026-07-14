// Defines shared CRM validation limits and Arabic labels.

export const CURRENT_YEAR = new Date().getFullYear();
export const CUSTOMER_SOURCE_OPTIONS = Object.freeze([
  ["whatsapp_campaign", "حملة واتساب"],
  ["instagram_campaign", "حملة إنستغرام"],
  ["meta_campaign", "حملة ميتا"],
  ["in_store", "عميل في المحل"],
  ["whatsapp_contact", "عبر الواتساب"],
  ["referral", "توصية من عميل"],
  ["other", "أخرى"],
]);

export const RX_LIMITS = Object.freeze({
  sph: [-30, 30, 0.25],
  cyl: [-7, 7, 0.25],
  axis: [1, 180, 1],
  add: [0, 6, 0.25],
  binocularPd: [35, 80, 1],
  monocularPd: [20, 45, 1],
});

export const RX_EXCEPTION_LIMITS = Object.freeze({
  sph: [-40, 40, 0.25],
  cyl: [-10, 10, 0.25],
  axis: [1, 180, 1],
  add: [0, 8, 0.25],
  binocularPd: [10, 100, 1],
  monocularPd: [10, 60, 1],
});

export const RFM_DEFAULT_RULES = Object.freeze({
  recencyDays: [30, 90, 180, 365],
  frequency: [1, 2, 4, 8],
  monetary: [500, 1500, 5000, 10000],
});
