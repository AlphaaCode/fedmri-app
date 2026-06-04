import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';

const uploadDir = join(process.cwd(), 'uploads-tmp');
mkdirSync(uploadDir, { recursive: true });

export const multerOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = extname(file.originalname);
      const name = `${randomUUID()}${ext}`;
      cb(null, name);
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
};
