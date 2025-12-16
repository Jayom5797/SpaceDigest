const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Parse year from various date formats
function extractYear(paper) {
  // Try paper.year first
  if (paper.year && typeof paper.year === 'number') {
    return paper.year;
  }
  
  // Try publicationDate: "Thu, 17 Dec 2020" or "2020-12-17"
  if (paper.publicationDate) {
    const yearMatch = paper.publicationDate.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      return parseInt(yearMatch[0]);
    }
  }
  
  // Try arxiv ID: "2012.09864" = Dec 2020
  if (paper.arxiv) {
    const match = paper.arxiv.match(/^(\d{2})(\d{2})\./);
    if (match) {
      const yy = parseInt(match[1]);
      const mm = parseInt(match[2]);
      // arxiv started in 1991, IDs < 91 are 20xx, >= 91 are 19xx
      const year = yy >= 91 ? 1900 + yy : 2000 + yy;
      if (year >= 1991 && year <= 2025) {
        return year;
      }
    }
  }
  
  return null;
}

async function repairYearData() {
  console.log('=== Repairing Year Data ===\n');
  
  // Get papers with NULL year
  const result = await client.execute('SELECT COUNT(*) as count FROM papers WHERE year IS NULL');
  const nullCount = result.rows[0].count;
  
  console.log(`Papers with NULL year: ${nullCount.toLocaleString()}`);
  
  if (nullCount === 0) {
    console.log('✓ No repairs needed\n');
    return;
  }
  
  console.log('Reading source files to extract years...\n');
  
  const topicsDir = 'database/topics';
  const topics = fs.readdirSync(topicsDir).filter(f => 
    fs.statSync(path.join(topicsDir, f)).isDirectory()
  );
  
  let updated = 0;
  let failed = 0;
  
  for (const topic of topics) {
    const topicPath = path.join(topicsDir, topic);
    const subtopicFiles = fs.readdirSync(topicPath).filter(f => 
      f.endsWith('.json') && f !== '_topic.json'
    );
    
    for (const subtopicFile of subtopicFiles) {
      const subtopicPath = path.join(topicPath, subtopicFile);
      const data = JSON.parse(fs.readFileSync(subtopicPath, 'utf8'));
      const papers = data.sources || data.papers || [];
      
      const updates = [];
      
      for (const paper of papers) {
        const year = extractYear(paper);
        if (year) {
          const id = paper.id || paper.arxiv;
          if (id) {
            updates.push({ id, year });
          }
        }
      }
      
      // Batch update
      if (updates.length > 0) {
        try {
          await client.batch(
            updates.map(u => ({
              sql: 'UPDATE papers SET year = ? WHERE id = ? AND year IS NULL',
              args: [u.year, u.id]
            })),
            'write'
          );
          updated += updates.length;
          process.stdout.write(`Updated: ${updated.toLocaleString()}\r`);
        } catch (error) {
          failed++;
          console.error(`\n❌ Error updating ${topic}/${subtopicFile}:`, error.message);
        }
      }
    }
  }
  
  console.log(`\n✓ Updated ${updated.toLocaleString()} papers`);
  
  // Verify
  const afterResult = await client.execute('SELECT COUNT(*) as count FROM papers WHERE year IS NULL');
  const stillNull = afterResult.rows[0].count;
  console.log(`Remaining NULL years: ${stillNull.toLocaleString()}\n`);
}

async function rebuildFTSIndex() {
  console.log('=== Rebuilding FTS Index ===\n');
  
  // Clear existing FTS data
  console.log('Clearing old FTS data...');
  await client.execute('DELETE FROM papers_fts');
  
  // Get total count
  const countResult = await client.execute('SELECT COUNT(*) as count FROM papers');
  const total = countResult.rows[0].count;
  console.log(`Total papers: ${total.toLocaleString()}\n`);
  
  const batchSize = 5000;
  let processed = 0;
  let errors = 0;
  
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
      errors++;
      if (errors < 5) {
        console.error(`\n❌ Error at offset ${offset}:`, error.message);
      }
    }
  }
  
  console.log('\n\n✓ FTS index rebuilt');
  
  // Verify
  const ftsCount = await client.execute('SELECT COUNT(*) as count FROM papers_fts');
  console.log(`FTS index rows: ${ftsCount.rows[0].count.toLocaleString()}\n`);
}

async function analyzeMissingPapers() {
  console.log('=== Analyzing Missing Papers ===\n');
  
  // Count papers in JSON files
  const topicsDir = 'database/topics';
  const topics = fs.readdirSync(topicsDir).filter(f => 
    fs.statSync(path.join(topicsDir, f)).isDirectory()
  );
  
  let totalInFiles = 0;
  const missingPapers = [];
  
  for (const topic of topics) {
    const topicPath = path.join(topicsDir, topic);
    const subtopicFiles = fs.readdirSync(topicPath).filter(f => 
      f.endsWith('.json') && f !== '_topic.json'
    );
    
    for (const subtopicFile of subtopicFiles) {
      const subtopicPath = path.join(topicPath, subtopicFile);
      const data = JSON.parse(fs.readFileSync(subtopicPath, 'utf8'));
      const papers = data.sources || data.papers || [];
      totalInFiles += papers.length;
      
      // Check for papers without IDs
      for (const paper of papers) {
        const id = paper.id || paper.arxiv;
        if (!id) {
          missingPapers.push({
            topic,
            subtopic: subtopicFile.replace('.json', ''),
            title: paper.title?.substring(0, 50) || 'NO TITLE',
            reason: 'No ID field'
          });
        }
      }
    }
  }
  
  const dbResult = await client.execute('SELECT COUNT(*) as count FROM papers');
  const totalInDB = dbResult.rows[0].count;
  
  console.log(`Papers in JSON files: ${totalInFiles.toLocaleString()}`);
  console.log(`Papers in database:   ${totalInDB.toLocaleString()}`);
  console.log(`Difference:           ${(totalInFiles - totalInDB).toLocaleString()}`);
  
  if (missingPapers.length > 0) {
    console.log(`\n❌ Papers without IDs: ${missingPapers.length}`);
    console.log('\nFirst 10 examples:');
    missingPapers.slice(0, 10).forEach(p => {
      console.log(`  - ${p.topic}/${p.subtopic}: "${p.title}"`);
    });
  }
  
  // Check for duplicates
  const dupResult = await client.execute(`
    SELECT id, COUNT(*) as count 
    FROM papers 
    GROUP BY id 
    HAVING count > 1
    LIMIT 10
  `);
  
  if (dupResult.rows.length > 0) {
    console.log(`\n⚠️  Duplicate IDs found: ${dupResult.rows.length}`);
    dupResult.rows.forEach(row => {
      console.log(`  - ${row.id}: ${row.count} copies`);
    });
  } else {
    console.log('\n✓ No duplicate IDs in database');
  }
  
  console.log();
}

async function verifyRepairs() {
  console.log('=== Verification ===\n');
  
  const stats = await client.execute(`
    SELECT 
      COUNT(*) as total,
      COUNT(year) as with_year,
      MIN(year) as min_year,
      MAX(year) as max_year
    FROM papers
  `);
  
  const row = stats.rows[0];
  console.log(`Total papers:     ${row.total.toLocaleString()}`);
  console.log(`With year data:   ${row.with_year.toLocaleString()} (${(row.with_year/row.total*100).toFixed(1)}%)`);
  console.log(`Year range:       ${row.min_year} - ${row.max_year}`);
  
  const ftsCount = await client.execute('SELECT COUNT(*) as count FROM papers_fts');
  console.log(`FTS index rows:   ${ftsCount.rows[0].count.toLocaleString()}`);
  
  console.log('\n✅ Repairs complete!\n');
}

async function main() {
  console.log('=== Turso Database Repair Tool ===\n');
  
  try {
    await repairYearData();
    await rebuildFTSIndex();
    await analyzeMissingPapers();
    await verifyRepairs();
  } catch (error) {
    console.error('\n❌ Repair failed:', error);
    process.exit(1);
  }
}

main();
