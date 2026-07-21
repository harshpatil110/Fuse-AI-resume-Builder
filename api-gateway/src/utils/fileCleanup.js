import fs from 'fs/promises';
import path from 'path';

export const cleanupFiles = async (filePaths) => {
  for (const filePath of filePaths) {
    if (!filePath) continue;
    try {
      await fs.unlink(path.resolve(filePath));
      console.log(`Successfully cleaned up file: ${filePath}`);
    } catch (error) {
      console.error(`Failed to clean up file ${filePath}:`, error.message);
    }
  }
};
