import multer from "multer";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxImageBytes,
    files: 4,
  },
});

const brandingUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxImageBytes,
    files: 4,
  },
});

const brandingPreviewUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxImageBytes,
    files: 1,
  },
});

const mockOutputUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxImageBytes,
    files: 4,
  },
});

const instagramSourceUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxImageBytes,
    files: 12,
  },
});

const feedbackImageUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.supabase.feedbackMaxImageBytes,
    files: 1,
  },
});

const crmImportUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(csv|xlsx|xls)$/i.test(file.originalname || "");
    cb(allowed ? null : new AppError("يسمح باستيراد ملفات CSV أو Excel فقط.", 400), allowed);
  },
});

export const productUpload = upload.fields([
  { name: "front", maxCount: 1 },
  { name: "side", maxCount: 1 },
  { name: "angle", maxCount: 1 },
  { name: "temple", maxCount: 1 },
]);

export const brandingUpload = brandingUploadMiddleware.fields([
  { name: "background", maxCount: 1 },
  { name: "logo", maxCount: 1 },
  { name: "footer", maxCount: 1 },
  { name: "priceLabelReference", maxCount: 1 },
]);

export const brandingPreviewUpload = brandingPreviewUploadMiddleware.single("sample");

export const mockOutputUpload = mockOutputUploadMiddleware.fields([
  { name: "front", maxCount: 1 },
  { name: "side", maxCount: 1 },
  { name: "angle", maxCount: 1 },
  { name: "hero", maxCount: 1 },
]);

export const instagramSourceUpload = instagramSourceUploadMiddleware.array("images", 12);
export const feedbackImageUpload = feedbackImageUploadMiddleware.single("image");
export const crmImportUpload = crmImportUploadMiddleware.single("file");

export function multerErrorHandler(error, req, res, next) {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(`Each image must be ${config.maxImageBytes / 1024 / 1024} MB or smaller.`, 400));
    }

    return next(new AppError(error.message, 400));
  }

  return next(error);
}

export function feedbackMulterErrorHandler(error, req, res, next) {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return next(new AppError(`يجب ألا يتجاوز حجم الصورة ${config.supabase.feedbackMaxImageBytes / 1024 / 1024} MB.`, 400));
  }
  if (error instanceof multer.MulterError) return next(new AppError("تعذر قراءة الصورة المرفقة.", 400));
  return next(error);
}
