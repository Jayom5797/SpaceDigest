const fs = require('fs');
const path = require('path');

console.log('=== Finding Missing Papers ===\n');

const topicsDir = 'database/topics';
const topics = fs.readdirSync(topicsDir).filter(f => 
  fs.statSync(path.join(topicsDir, f)).isDirectory()
);

let totalInFiles = 0;
let noIdCount = 0;
let duplicateIds = new Set();
const seenIds = new Set();

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
    
    for (const paper of papers) {
      const id = paper.id || paper.arxiv;
      
      if (!id) {
        noIdCount++;
        if (noIdCount <= 5) {
          console.log(`❌ No ID: ${topic}/${subtopicFile} - "${paper.title?.substring(0, 60)}"`);
        }
      } else if (seenIds.has(id)) {
        duplicateIds.add(id);
      } else {
        seenIds.add(id);
      }
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`Total papers in files: ${totalInFiles.toLocaleString()}`);
console.log(`Unique IDs: ${seenIds.size.toLocaleString()}`);
console.log(`Papers without ID: ${noIdCount.toLocaleString()}`);
console.log(`Duplicate IDs: ${duplicateIds.size.toLocaleString()}`);

const expected = 972325;
const missing = totalInFiles - expected;
console.log(`\nExpected in DB: ${expected.toLocaleString()}`);
console.log(`Missing: ${missing.toLocaleString()}`);
console.log(`\nBreakdown:`);
console.log(`  - Duplicates: ${duplicateIds.size.toLocaleString()}`);
console.log(`  - No ID: ${noIdCount.toLocaleString()}`);
console.log(`  - Accounted for: ${(duplicateIds.size + noIdCount).toLocaleString()}`);
console.log(`  - Unexplained: ${(missing - duplicateIds.size - noIdCount).toLocaleString()}`);
