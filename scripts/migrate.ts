import { SafeoutSDK } from '../client/class_safeout';
import * as dotenv from 'dotenv';

async function runMigrations() {
  // Load environment variables
  dotenv.config();

  console.log('🚀 Starting database migrations...');

  const sdk = new SafeoutSDK();

  try {
    // Initialize with database connection only (no Solana/crypto needed for migrations)
    await sdk.init({
      databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/safeout",
      rpcUrl: "https://api.devnet.solana.com", // dummy, not used for migrations
    });

    console.log('📡 Connected to database, running migrations...');
    await sdk.runDatabaseMigrations();

    console.log('✅ All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runMigrations().catch(console.error);
}

export { runMigrations };
