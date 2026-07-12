// Enforces CRM sessions, CSRF tokens, and the local staff/superuser boundary.

import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { readCrmSession, validCsrf } from "../services/crmSessionService.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export async function requireCrmSession(req, res, next) {
  try {
    const token = parseCookies(req.get("cookie")).alaslee_crm_session;
    const session = await readCrmSession(token);
    if (!session) return next(new AppError("يجب تسجيل الدخول إلى إدارة العملاء.", 401));
    req.crmSessionToken = token;
    req.crmActor = session;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireCrmCsrf(req, res, next) {
  if (safeMethods.has(req.method)) return next();
  if (validCsrf(req.crmActor, req.get("x-csrf-token"))) return next();
  return next(new AppError("رمز حماية الطلب غير صالح.", 403));
}

export function requireSuperuser(req, res, next) {
  if (req.crmActor?.role === "superuser") return next();
  return next(new AppError("هذه العملية متاحة للمشرف الأعلى فقط.", 403));
}

export function setCrmSessionCookie(res, token, csrfToken, expiresAt) {
  const secure = config.crm.secureCookie ? "; Secure" : "";
  res.append("Set-Cookie", `alaslee_crm_session=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure}`);
  res.append("Set-Cookie", `alaslee_crm_csrf=${csrfToken}; Path=/; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure}`);
}

export function clearCrmSessionCookie(res) {
  res.append("Set-Cookie", "alaslee_crm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  res.append("Set-Cookie", "alaslee_crm_csrf=; Path=/; SameSite=Strict; Max-Age=0");
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}
