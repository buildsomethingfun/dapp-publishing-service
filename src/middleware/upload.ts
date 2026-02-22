import multer from "multer";
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";

const uploadDir = path.join(
  os.tmpdir(),
  "publishing-service-uploads"
);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
});

export { uploadDir };
