const { createClient } = require('@libsql/client');
require('dotenv').config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function addSourceField() {
  console.log('=== Adding Source Field to Database ===\n');
  
  try {
    // Add source column (default to 'arxiv' for existing papers)
    console.log('Adding source column...');
    await client.execute(`
      ALTER TABLE papers ADD COLUMN source TEXT DEFAULT 'arxiv'
    `);
    console.log('✓ Source column added\n');
    
    // Update papers based on ID pattern
    console.log('Detecting sources from paper IDs...');
    
    // Papers with bibcode pattern are from NASA ADS
    const adsResult = await client.execute(`
      UPDATE papers 
      SET source = 'nasa-ads' 
      WHERE id LIKE '%ApJ%' 
         OR id LIKE '%MNRAS%'
         OR id LIKE '%A&A%'
         OR id LIKE '%AJ%'
         OR id LIKE '%PhRv%'
         OR id LIKE '%PASP%'
         OR id LIKE '%Natur%'
         OR id LIKE '%Sci%'
         OR id LIKE '%cosp%'
         OR id LIKE '%AIPC%'
         OR id LIKE '%BASI%'
         OR id LIKE '%nova.pres%'
    `);
    
    console.log(`✓ Updated NASA ADS papers\n`);
    
    // Verify
    const stats = await client.execute(`
      SELECT source, COUNT(*) as count 
      FROM papers 
      GROUP BY source
    `);
    
    console.log('Source distribution:');
    stats.rows.forEach(row => {
      console.log(`  ${row.source}: ${row.count.toLocaleString()} papers`);
    });
    
    console.log('\n✅ Migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

addSourceField();
