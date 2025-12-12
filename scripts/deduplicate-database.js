/**
 * Remove duplicate papers from topic files
 * Usage: node scripts/deduplicate-database.js
 */

const fs = require('fs');
const path = require('path');

const TOPICS_DIR = path.join(__dirname, '../database/topics');

async function deduplicate() {
  console.log('=== Deduplicating Database ===\n');
  
  const topicFiles = fs.readdirSync(TOPICS_DIR)
    .filter(f => f.endsWith('.json') && f !== '_metadata.json');
  
  let totalRemoved = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  
  for (const file of topicFiles) {
    const filepath = path.join(TOPICS_DIR, file);
    const topic = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    
    console.log(`Processing: ${topic.topic}`);
    
    for (const subtopic of topic.subtopics) {
      const before = subtopic.sources.length;
      totalBefore += before;
      
      // Deduplicate by URL
      const seen = new Set();
      const unique = [];
      
      for (const paper of subtopic.sources) {
        if (!seen.has(paper.url)) {
          seen.add(paper.url);
          unique.push(paper);
        }
      }
      
      subtopic.sources = unique;
      const after = unique.length;
      totalAfter += after;
      const removed = before - after;
      totalRemoved += removed;
      
      if (removed > 0) {
        console.log(`  ${subtopic.name}: ${before} → ${after} (-${removed} duplicates)`);
      }
    }
    
    fs.writeFileSync(filepath, JSON.stringify(topic, null, 2));
  }
  
  console.log('\n✓ Deduplication complete');
  console.log(`  Before: ${totalBefore.toLocaleString()} papers`);
  console.log(`  After: ${totalAfter.toLocaleString()} papers`);
  console.log(`  Removed: ${totalRemoved.toLocaleString()} duplicates`);
  console.log('\nNext step: Run "npm run build" to update metadata');
}

deduplicate().catch(console.error);
