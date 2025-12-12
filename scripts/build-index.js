/**
 * Build search index: generate keywords and update metadata
 * Usage: node scripts/build-index.js
 */

const fs = require('fs');
const path = require('path');

const TOPICS_DIR = path.join(__dirname, '../database/topics');

function extractKeywords(papers, topN = 20) {
  const wordFreq = new Map();
  const phraseFreq = new Map();
  
  const stopWords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'have', 'been', 'were', 
    'are', 'for', 'was', 'has', 'can', 'will', 'but', 'not', 'you', 'all',
    'their', 'said', 'there', 'use', 'into', 'than', 'them', 'these', 'its',
    'only', 'other', 'which', 'when', 'time', 'also', 'some', 'could', 'our',
    'using', 'used', 'such', 'may', 'more', 'two', 'one', 'new', 'show',
    'study', 'results', 'data', 'paper', 'present', 'based', 'model', 'models'
  ]);
  
  for (const paper of papers) {
    const text = `${paper.title} ${paper.abstract || ''}`.toLowerCase();
    const words = text.match(/\b[a-z]{3,}\b/g) || [];
    
    for (const word of words) {
      if (!stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }
    
    for (let i = 0; i < words.length - 1; i++) {
      if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
        const phrase = words[i] + ' ' + words[i + 1];
        phraseFreq.set(phrase, (phraseFreq.get(phrase) || 0) + 1);
      }
    }
  }
  
  const topWords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
  
  const topPhrases = Array.from(phraseFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.floor(topN / 2))
    .map(([phrase]) => phrase);
  
  return [...topPhrases, ...topWords];
}

async function buildIndex() {
  console.log('=== Building Search Index ===\n');
  
  const topicDirs = fs.readdirSync(TOPICS_DIR)
    .filter(f => fs.statSync(path.join(TOPICS_DIR, f)).isDirectory());
  
  let totalSources = 0;
  let totalSubtopics = 0;
  let oldestDate = null;
  let newestDate = null;
  
  const topicBreakdown = [];
  
  for (const topicDir of topicDirs) {
    const topicPath = path.join(TOPICS_DIR, topicDir);
    const subtopicFiles = fs.readdirSync(topicPath)
      .filter(f => f.endsWith('.json') && f !== '_topic.json');
    
    if (subtopicFiles.length === 0) continue;
    
    // Load first subtopic to get topic name
    const firstSubtopic = JSON.parse(fs.readFileSync(path.join(topicPath, subtopicFiles[0]), 'utf8'));
    const topicName = firstSubtopic.topic;
    
    console.log(`Processing: ${topicName}`);
    
    const subtopicBreakdown = [];
    let topicTotal = 0;
    
    for (const file of subtopicFiles) {
      const filepath = path.join(topicPath, file);
      const subtopicData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      
      // Generate keywords
      const keywords = extractKeywords(subtopicData.sources, 30);
      subtopicData.keywords = keywords;
      
      // Update counts
      totalSources += subtopicData.sources.length;
      totalSubtopics++;
      topicTotal += subtopicData.sources.length;
      
      // Track dates
      for (const source of subtopicData.sources) {
        const date = source.publicationDate;
        if (date) {
          if (!oldestDate || date < oldestDate) oldestDate = date;
          if (!newestDate || date > newestDate) newestDate = date;
        }
      }
      
      console.log(`  ${subtopicData.subtopic}: ${subtopicData.sources.length} papers, ${keywords.slice(0, 3).join(', ')}...`);
      
      // Save updated subtopic file
      fs.writeFileSync(filepath, JSON.stringify(subtopicData, null, 2));
      
      subtopicBreakdown.push({
        name: subtopicData.subtopic,
        paperCount: subtopicData.sources.length,
        keywordCount: keywords.length
      });
    }
    
    topicBreakdown.push({
      topic: topicName,
      totalPapers: topicTotal,
      subtopicCount: subtopicFiles.length,
      subtopics: subtopicBreakdown
    });
  }
  
  // Sort by paper count descending
  topicBreakdown.sort((a, b) => b.totalPapers - a.totalPapers);
  
  // Update metadata
  const metadata = {
    lastUpdated: new Date().toISOString(),
    totalTopics: topicDirs.length,
    totalSubtopics: totalSubtopics,
    totalSources: totalSources,
    oldestPaper: oldestDate,
    newestPaper: newestDate,
    version: '5.0',
    generatedBy: 'build-index-per-subtopic',
    breakdown: topicBreakdown
  };
  
  const metaPath = path.join(TOPICS_DIR, '_metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify({ 
    domain: 'Space Science', 
    metadata 
  }, null, 2));
  
  console.log('\n✓ Index built');
  console.log(`  Topics: ${metadata.totalTopics}`);
  console.log(`  Subtopics: ${metadata.totalSubtopics}`);
  console.log(`  Sources: ${metadata.totalSources.toLocaleString()}`);
  console.log(`  Date range: ${oldestDate} to ${newestDate}`);
}

buildIndex().catch(console.error);
