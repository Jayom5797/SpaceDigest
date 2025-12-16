const { createClient } = require('@libsql/client');
require('dotenv').config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function verify() {
  console.log('=== Database Verification ===\n');
  
  // Check papers
  const papers = await client.execute('SELECT COUNT(*) as count FROM papers');
  console.log(`Total papers: ${papers.rows[0].count.toLocaleString()}`);
  
  // Check year data
  const years = await client.execute(`
    SELECT 
      COUNT(*) as total,
      COUNT(year) as with_year,
      MIN(year) as min_year,
      MAX(year) as max_year
    FROM papers
  `);
  const y = years.rows[0];
  console.log(`Papers with year: ${y.with_year.toLocaleString()} (${(y.with_year/y.total*100).toFixed(1)}%)`);
  console.log(`Year range: ${y.min_year} - ${y.max_year}`);
  
  // Check FTS index
  const fts = await client.execute('SELECT COUNT(*) as count FROM papers_fts');
  console.log(`\nFTS index rows: ${fts.rows[0].count.toLocaleString()}`);
  
  // Test FTS search
  const search = await client.execute({
    sql: `SELECT COUNT(*) as count FROM papers_fts WHERE papers_fts MATCH ?`,
    args: ['black holes']
  });
  console.log(`FTS search test: ${search.rows[0].count.toLocaleString()} results for "black holes"`);
  
  // Check topics
  const topics = await client.execute(`
    SELECT topic, COUNT(*) as count 
    FROM papers 
    GROUP BY topic 
    ORDER BY count DESC
  `);
  console.log(`\nTop 5 topics:`);
  topics.rows.slice(0, 5).forEach(row => {
    console.log(`  ${row.topic}: ${row.count.toLocaleString()}`);
  });
  
  console.log('\n✅ Verification complete');
}

verify().catch(console.error);
