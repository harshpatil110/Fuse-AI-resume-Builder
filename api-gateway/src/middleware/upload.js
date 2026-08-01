import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Strip directory components and hostile characters from the client-supplied
    // name so an attacker-controlled originalname cannot escape uploads/.
    const safeName = path.basename(file.originalname || '').replace(/[^\w.\- ]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});

// Matched by file *extension* rather than MIME type — browsers label .tex files
// inconsistently (application/x-tex, text/plain, application/octet-stream), but
// the extension is reliable.
const allowedExtensions = {
  resume: ['.pdf', '.tex'],
  jd_file: ['.pdf', '.txt']
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowed = allowedExtensions[file.fieldname] || [];

  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${file.fieldname}. Allowed types are ${allowed.join(', ') || 'none'}.`), false);
  }
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: fileFilter
});
