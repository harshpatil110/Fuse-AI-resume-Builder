import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

let db;
try {
  if (!process.env.DATABASE_URL) {
    console.error("⚠️ Missing DATABASE_URL in environment variables");
  } else {
    const sql = neon(process.env.DATABASE_URL);
    db = drizzle(sql);
  }
} catch (error) {
  console.error("❌ Database initialization failed:", error);
}

export { db };
