/**
 * Module 2: Source Retrieval API
 * Returns relevant papers for fact-checking
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const HierarchicalIndex = require('./hierarchical-index');
const KeywordLearner = require('./keyword-learner');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize hierarchical index and keyword learner
let index = null;
let learner = null;
const TOPICS_DIR = path.join(__dirname, '../database/topics');

async function loadIndex() {
  console.log('Loading hierarchical index from per-subtopic files...');
  const metaPath = path.join(TOPICS_DIR, '_metadata.json');
  
  if (!fs.existsSync(metaPath)) {
    console.error('ERROR: database/topics/_metadata.json not found');
    process.exit(1);
  }
  
  // Load metadata
  const { domain, metadata } = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  
  // Load all topics from subdirectories
  const topicDirs = fs.readdirSync(TOPICS_DIR)
    .filter(f => fs.statSync(path.join(TOPICS_DIR, f)).isDirectory());
  
  const topics = [];
  
  for (const topicDir of topicDirs) {
    const topicPath = path.join(TOPICS_DIR, topicDir);
    const subtopicFiles = fs.readdirSync(topicPath)
      .filter(f => f.endsWith('.json') && f !== '_topic.json');
    
    if (subtopicFiles.length === 0) continue;
    
    // Load first subtopic to get topic name
    const firstSubtopic = JSON.parse(fs.readFileSync(path.join(topicPath, subtopicFiles[0]), 'utf8'));
    const topicName = firstSubtopic.topic;
    
    // Load all subtopics for this topic
    const subtopics = [];
    for (const file of subtopicFiles) {
      const subtopicData = JSON.parse(fs.readFileSync(path.join(topicPath, file), 'utf8'));
      subtopics.push({
        name: subtopicData.subtopic,
        keywords: subtopicData.keywords || [],
        sources: subtopicData.sources || []
      });
    }
    
    topics.push({
      topic: topicName,
      subtopics: subtopics
    });
    
    console.log(`  Loaded: ${topicName} (${subtopics.length} subtopics)`);
  }
  
  const data = { domain, metadata, topics };
  
  console.log('  Building index...');
  index = new HierarchicalIndex();
  index.buildFromJSON(data);
  
  // Initialize keyword learner with reload callback
  learner = new KeywordLearner(TOPICS_DIR, reloadTopic);
  
  console.log('✓ Index ready');
  console.log('✓ Keyword learner initialized');
}

/**
 * Reload a specific topic file when keywords are updated
 */
function reloadTopic(topicName) {
  try {
    const filename = topicName.toLowerCase().replace(/\s+/g, '-') + '.json';
    const topicPath = path.join(TOPICS_DIR, filename);
    
    if (!fs.existsSync(topicPath)) {
      console.error(`[Reload] Topic file not found: ${filename}`);
      return;
    }
    
    const updatedTopic = JSON.parse(fs.readFileSync(topicPath, 'utf8'));
    
    // Update the index with new topic data
    index.updateTopic(updatedTopic);
    
    console.log(`[Reload] ✓ Refreshed ${topicName} with updated keywords`);
  } catch (error) {
    console.error(`[Reload] Failed to reload ${topicName}:`, error.message);
  }
}

loadIndex().catch(err => {
  console.error('Failed to load index:', err);
  process.exit(1);
});

/**
 * POST /api/get-sources
 * Main endpoint: Returns relevant papers for a claim
 */
app.post('/api/get-sources', (req, res) => {
  try {
    const { claim } = req.body;
    
    if (!claim || typeof claim !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid input. Provide a claim string.' 
      });
    }
    
    const startTime = Date.now();
    
    // Extract keywords from claim (preserve word order for phrase matching)
    const words = claim.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const stopWords = ['the', 'and', 'that', 'this', 'with', 'from', 'have', 'been', 'were', 'are', 'for', 'can', 'will', 'but', 'not'];
    const keywords = words.filter(word => !stopWords.includes(word));
    
    if (keywords.length === 0) {
      return res.json({
        domain: index.domain,
        topic: null,
        subtopic: null,
        sources: [],
        totalSources: 0,
        queryTime: Date.now() - startTime,
        message: 'No keywords extracted from claim'
      });
    }
    
    // Search for matching subtopics
    const rankedSubtopics = index.searchByKeywords(keywords);
    
    if (rankedSubtopics.length === 0) {
      return res.json({
        domain: index.domain,
        topic: null,
        subtopic: null,
        sources: [],
        totalSources: 0,
        queryTime: Date.now() - startTime,
        message: 'No matching subtopics found'
      });
    }
    
    // Get sources from top-ranked subtopic
    const topMatch = rankedSubtopics[0];
    const sources = index.getSourcesBySubtopic(topMatch.topic, topMatch.subtopic, 50);
    
    // Learn from this query
    learner.recordQuery(keywords, topMatch.topic, topMatch.subtopic, topMatch.relevance);
    
    res.json({
      domain: index.domain,
      topic: topMatch.topic,
      subtopic: topMatch.subtopic,
      relevance: topMatch.relevance,
      sources: sources,
      totalSources: sources.length,
      queryTime: Date.now() - startTime,
      message: `Found ${sources.length} source(s) in ${topMatch.topic} → ${topMatch.subtopic}`
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

/**
 * GET /api/stats
 * Returns index statistics
 */
app.get('/api/stats', (req, res) => {
  res.json({
    status: 'ok',
    stats: index.getStats(),
    domain: index.domain
  });
});

/**
 * GET /api/learning-stats
 * Returns keyword learning statistics
 */
app.get('/api/learning-stats', (req, res) => {
  res.json({
    status: 'ok',
    learning: learner.getStats()
  });
});

/**
 * GET /api/topics
 * Returns all topics and subtopics
 */
app.get('/api/topics', (req, res) => {
  const structure = [];
  
  for (const [topicName, topicData] of index.topics) {
    const subtopics = [];
    
    for (const [key, subtopicData] of index.subtopics) {
      if (subtopicData.topic === topicName) {
        subtopics.push({
          name: subtopicData.name,
          sourceCount: subtopicData.sourceCount,
          keywords: subtopicData.keywords
        });
      }
    }
    
    structure.push({
      topic: topicName,
      subtopics: subtopics
    });
  }
  
  res.json({
    domain: index.domain,
    topics: structure
  });
});

app.listen(PORT, () => {
  console.log(`\n✓ Module 2: Source Retrieval API running on http://localhost:${PORT}`);
  console.log(`  API: POST /api/get-sources`);
  console.log(`  Stats: GET /api/stats`);
  console.log(`  Topics: GET /api/topics\n`);
});
