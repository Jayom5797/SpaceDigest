/**
 * Split per-topic JSON files into per-subtopic JSON files
 * This preserves all data while making files small enough to process
 * 
 * OLD: database/topics/galaxies.json (434MB)
 * NEW: database/topics/galaxies/formation-and-evolution.json (80MB)
 *      database/topics/galaxies/observations.json (150MB)
 *      etc.
 * 
 * Usage: node --max-old-space-size=8192 scripts/split-topics-to-subtopics.js
 */

const fs = require('fs');
const path = require('path');

const TOPICS_DIR = path.join(__dirname, '../database/topics');
const BACKUP_DIR = path.join(__dirname, '../database/topics-backup');

async function splitTopic(topicFile) {
  const filepath = path.join(TOPICS_DIR, topicFile);
  const stats = fs.statSync(filepath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
  
  console.log(`\nProcessing: ${topicFile} (${sizeMB}MB)`);
  
  // Read topic data
  let topicData;
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    topicData = JSON.parse(content);
  } catch (err) {
    console.error(`  ✗ Failed to parse: ${err.message}`);
    return { success: false, error: err.message };
  }
  
  const topicName = topicData.topic;
  const totalPapers = topicData.subtopics.reduce((sum, s) => sum + s.sources.length, 0);
  
  console.log(`  Topic: ${topicName}`);
  console.log(`  Subtopics: ${topicData.subtopics.length}`);
  console.log(`  Total papers: ${totalPapers.toLocaleString()}`);
  
  // Create topic subdirectory
  const topicDirName = topicName.toLowerCase().replace(/\s+/g, '-');
  const topicDir = path.join(TOPICS_DIR, topicDirName);
  
  if (!fs.existsSync(topicDir)) {
    fs.mkdirSync(topicDir, { recursive: true });
  }
  
  // Save each subtopic as separate file
  let savedPapers = 0;
  const subtopicFiles = [];
  
  for (const subtopic of topicData.subtopics) {
    const subtopicFileName = subtopic.name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/\//g, '-')  // Replace slashes
      .replace(/[^a-z0-9-]/g, '')  // Remove other invalid chars
      + '.json';
    const subtopicPath = path.join(topicDir, subtopicFileName);
    
    const subtopicData = {
      topic: topicName,
      subtopic: subtopic.name,
      keywords: subtopic.keywords || [],
      sources: subtopic.sources
    };
    
    // Write subtopic file
    fs.writeFileSync(subtopicPath, JSON.stringify(subtopicData, null, 2));
    
    savedPapers += subtopic.sources.length;
    subtopicFiles.push(subtopicFileName);
    
    const subtopicSizeMB = (fs.statSync(subtopicPath).size / (1024 * 1024)).toFixed(1);
    console.log(`    ✓ ${subtopic.name}: ${subtopic.sources.length.toLocaleString()} papers (${subtopicSizeMB}MB)`);
  }
  
  // Verify paper count
  if (savedPapers !== totalPapers) {
    console.error(`  ✗ Paper count mismatch! Expected ${totalPapers}, saved ${savedPapers}`);
    return { success: false, error: 'Paper count mismatch' };
  }
  
  // Create topic metadata file
  const metadataPath = path.join(topicDir, '_topic.json');
  const metadata = {
    topic: topicName,
    totalPapers: totalPapers,
    subtopicCount: topicData.subtopics.length,
    subtopicFiles: subtopicFiles,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  
  console.log(`  ✓ Split complete: ${savedPapers.toLocaleString()} papers verified`);
  
  return { 
    success: true, 
    topic: topicName,
    papers: savedPapers,
    subtopics: topicData.subtopics.length,
    files: subtopicFiles
  };
}

async function splitAllTopics() {
  console.log('=== Splitting Topics into Subtopic Files ===');
  console.log('This preserves all data while making files manageable\n');
  
  // Create backup directory
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  // Get all topic files
  const topicFiles = fs.readdirSync(TOPICS_DIR)
    .filter(f => f.endsWith('.json') && f !== '_metadata.json')
    .sort();
  
  console.log(`Found ${topicFiles.length} topic files to split\n`);
  
  const results = [];
  let totalPapers = 0;
  let successCount = 0;
  let failCount = 0;
  
  for (const topicFile of topicFiles) {
    const result = await splitTopic(topicFile);
    results.push(result);
    
    if (result.success) {
      successCount++;
      totalPapers += result.papers;
      
      // Backup original file
      const backupPath = path.join(BACKUP_DIR, topicFile);
      fs.copyFileSync(path.join(TOPICS_DIR, topicFile), backupPath);
      console.log(`  ✓ Backed up to: topics-backup/${topicFile}`);
    } else {
      failCount++;
    }
  }
  
  console.log('\n=== Split Summary ===');
  console.log(`  Success: ${successCount} topics`);
  console.log(`  Failed: ${failCount} topics`);
  console.log(`  Total papers: ${totalPapers.toLocaleString()}`);
  console.log(`  Backup location: database/topics-backup/`);
  
  if (successCount === topicFiles.length) {
    console.log('\n✓ All topics split successfully!');
    console.log('\nNext steps:');
    console.log('  1. Verify the new structure in database/topics/');
    console.log('  2. Delete old topic JSON files: rm database/topics/*.json (except _metadata.json)');
    console.log('  3. Update scripts to use new structure');
  } else {
    console.log('\n⚠ Some topics failed to split. Check errors above.');
  }
  
  return results;
}

splitAllTopics().catch(console.error);
