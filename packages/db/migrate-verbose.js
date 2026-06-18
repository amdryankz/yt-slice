import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pkg from 'pg';
const { Client } = pkg;
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env') });

async function main() {
  console.log("Starting programmatic migration...");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log("Connected to DB...");
    const db = drizzle(client);
    
    console.log("Applying migrations from ./drizzle folder...");
    await migrate(db, { migrationsFolder: './drizzle' });
    
    console.log("✅ Migrations applied successfully!");
  } catch (e) {
    console.error("❌ MIGRATION ERROR:", e);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
