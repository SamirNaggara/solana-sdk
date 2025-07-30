// jest.setup.js
const path = require('path');
const fs = require('fs');

// Load environment variables for testing (quiet mode to reduce log noise)
const envPath = path.join(__dirname, '.env.test');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ 
    path: envPath, 
    override: false,
    // Reduce noise in CI environments
    debug: false
  });
}

// Set default DATABASE_URL if not set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://safeout:pide@localhost:4242/sdk-1?schema=public";
}
