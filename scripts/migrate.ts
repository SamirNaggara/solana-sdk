import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigrations() {
  // Load environment variables
  require('dotenv').config();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env file');
    console.log('Please create a .env file with: DATABASE_URL="postgresql://user:password@localhost:5432/database"');
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    console.log(`🔗 Connecting to database: ${databaseUrl.replace(/:[^:@]*@/, ':***@')}`);
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get list of executed migrations
    const result = await client.query('SELECT filename FROM migrations');
    const executedMigrations = new Set(result.rows.map(row => row.filename));

    // Read and execute migration files
    const migrationFiles = ['001_initial_schema.sql'];
    
    for (const filename of migrationFiles) {
      if (executedMigrations.has(filename)) {
        console.log(`Migration ${filename} already executed, skipping...`);
        continue;
      }

      console.log(`Executing migration: ${filename}`);
      const migrationPath = join(__dirname, '..', 'migrations', filename);
      const migrationSQL = readFileSync(migrationPath, 'utf-8');

      await client.query(migrationSQL);
      await client.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
      
      console.log(`Migration ${filename} executed successfully`);
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations().catch(console.error);
}

export { runMigrations };
