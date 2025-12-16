const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// Configuration
const BATCH_SIZE = 10; // Insert 10 papers at a time (Turso has query size limits)
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('❌ Missing environment variables:');
  console.error('   TURSO_DATABASE_URL');
  console.error('   TURSO_AUTH_TOKEN');
  console.error('\nGet these from: turso db show <db-name>');
  process.exit(1);
}

// Escape single quotes for SQL
function escape(str) {
  if (!str) return '';
  return str.toString().replace(/'/g, "''");
}

async function createSchema(client) {
  console.log('Creating schema...');
  
  // Main papers table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      abstract TEXT,
      authors TEXT,
      year INTEGER,
      topic TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      keywords TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);
  
  // Indexes for fast queries
  await client.execute('CREATE INDEX IF NOT EXISTS idx_topic_subtopic ON papers(topic, subtopic)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_year ON papers(year)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_topic ON papers(topic)');
  
  // Full-text search virtual table
  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
      title,
      abstract,
      content='papers',
      content_rowid='rowid'
    )
  `);
  
  console.log('✓ Schema created');
}

async function migrate() {
  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });

  console.log('=== Turso Migration ===\n');
  
  // Create schema
  await createSchema(client);
  
  let totalPapers = 0;
  let totalTopics = 0;
  let totalSubtopics = 0;
  
  const topicsDir = 'database/topics';
  const topics = fs.readdirSync(topicsDir).filter(f => 
    fs.statSync(path.join(topicsDir, f)).isDirectory()
  );

  console.log(`\nMigrating ${topics.length} topics...\n`);

  for (const topic of topics) {
    const topicPath = path.join(topicsDir, topic);
    const subtopicFiles = fs.readdirSync(topicPath).filter(f => 
      f.endsWith('.json') && f !== '_topic.json'
    );

    totalTopics++;
    
    for (const subtopicFile of subtopicFiles) {
      const subtopicPath = path.join(topicPath, subtopicFile);
      const data = JSON.parse(fs.readFileSync(subtopicPath, 'utf8'));
      
      const subtopic = subtopicFile.replace('.json', '');
      totalSubtopics++;
      
      const papers = data.sources || data.papers || [];
      console.log(`📁 ${topic}/${subtopic}: ${papers.length} papers`);

      // Batch insert
      for (let i = 0; i < papers.length; i += BATCH_SIZE) {
        const batch = papers.slice(i, i + BATCH_SIZE);
        
        // Build VALUES clause
        const values = batch.map(paper => {
          const authors = JSON.stringify(paper.authors || []);
          const keywords = JSON.stringify(paper.keywords || []);
          
          return `(
            '${escape(paper.id)}',
            '${escape(paper.title)}',
            '${escape(paper.abstract || '')}',
            '${escape(authors)}',
            ${paper.year || 'NULL'},
            '${escape(topic)}',
            '${escape(subtopic)}',
            '${escape(keywords)}'
          )`;
        }).join(',\n');

        try {
          const result = await client.execute({
            sql: `
              INSERT OR IGNORE INTO papers 
              (id, title, abstract, authors, year, topic, subtopic, keywords)
              VALUES ${values}
            `,
            args: []
          });
          
          totalPapers += batch.length;
          
          if (i % 1000 === 0 && i > 0) {
            process.stdout.write(`   Progress: ${i}/${papers.length}\r`);
          }
        } catch (error) {
          console.error(`\n❌ Error inserting batch at ${i}:`, error.message);
          console.error('Error details:', error);
          console.error('First paper in batch:', JSON.stringify(batch[0], null, 2));
          // Continue with next batch
        }
      }
      
      console.log(`   ✓ Complete: ${papers.length} papers`);
    }
  }

  console.log('\n\n=== Building Full-Text Search Index ===\n');
  console.log('This may take 2-3 minutes...');
  
  try {
    await client.execute({
      sql: `INSERT INTO papers_fts(rowid, title, abstract)
            SELECT rowid, title, abstract FROM papers`,
      args: []
    });
    console.log('✓ FTS index built');
  } catch (error) {
    console.error('❌ FTS index error:', error.message);
  }

  console.log('\n=== Migration Summary ===\n');
  console.log(`Topics:     ${totalTopics}`);
  console.log(`Subtopics:  ${totalSubtopics}`);
  console.log(`Papers:     ${totalPapers.toLocaleString()}`);
  
  // Verify
  const result = await client.execute({ sql: 'SELECT COUNT(*) as count FROM papers', args: [] });
  console.log(`Verified:   ${result.rows[0].count.toLocaleString()} papers in database`);
  
  console.log('\n✅ Migration complete!');
  console.log('\nNext steps:');
  console.log('1. Update backend/server.js to use Turso');
  console.log('2. Set environment variables in Railway');
  console.log('3. Deploy backend');
}

migrate().catch(error => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
