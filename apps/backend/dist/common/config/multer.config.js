"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.multerOptions = void 0;
const multer_1 = require("multer");
const path_1 = require("path");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const uploadDir = (0, path_1.join)(process.cwd(), 'uploads-tmp');
(0, fs_1.mkdirSync)(uploadDir, { recursive: true });
exports.multerOptions = {
    storage: (0, multer_1.diskStorage)({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const ext = (0, path_1.extname)(file.originalname);
            const name = `${(0, crypto_1.randomUUID)()}${ext}`;
            cb(null, name);
        },
    }),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
    },
};
//# sourceMappingURL=multer.config.js.map