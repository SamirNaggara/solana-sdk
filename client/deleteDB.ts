import { Client } from 'pg';

const databaseUrl = "postgresql://dpp:dpp@localhost:5432/template_db?schema=public";

async function deleteAllData() {
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Delete all data in reverse order of dependencies
    await client.query('DELETE FROM dpp_product_visibility');
    await client.query('DELETE FROM dpp_product_history');
    await client.query('DELETE FROM material_compositions');
    await client.query('DELETE FROM hazardous_substances');
    await client.query('DELETE FROM dpp_products');
    await client.query('DELETE FROM manufacturers');

    console.log('All data deleted successfully');
  } catch (error) {
    console.error('Error deleting data:', error);
  } finally {
    await client.end();
  }
}

deleteAllData();
