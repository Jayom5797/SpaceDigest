const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function buildFTSIndex() {
  console.log('Building FTS index in batches...\n');
  
  // Get total count
  const countResult = await client.execute('SELECT COUNT(*) as count FROM papers');
  const total = countResult.rows[0].count;
  console.log(`Total papers: ${total.toLocaleString()}`);
  
  const batchSize = 10000;
  let processed = 0;
  
  for (let offset = 0; offset < total; offset += batchSize) {
    try {
      await client.execute({
        sql: `INSERT INTO papers_fts(rowid, title, abstract)
              SELECT rowid, title, abstract FROM papers
              LIMIT ? OFFSET ?`,
        args: [batchSize, offset]
      });
      
      processed += batchSize;
      const pct = Math.min(100, (processed / total * 100)).toFixed(1);
      process.stdout.write(`Progress: ${processed.toLocaleString()}/${total.toLocaleString()} (${pct}%)\r`);
    } catch (error) {
      console.error(`\nError at offset ${offset}:`, error.message);
    }
  }
  
  console.log('\n\n✓ FTS index built');
  
  // Verify
  const ftsCount = await client.execute('SELECT COUNT(*) as count FROM papers_fts');
  console.log(`FTS index rows: ${ftsCount.rows[0].count.toLocaleString()}`);
}

buildFTSIndex().catch(console.error);
