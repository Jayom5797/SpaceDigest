/**
 * Dynamic Keyword Learning System
 * Learns from user queries to improve search relevance over time
 */

const fs = require('fs');
const path = require('path');

class KeywordLearner {
  constructor(topicsDir, reloadCallback = null) {
    this.topicsDir = topicsDir;
    this.learningLog = [];
    this.minQueryCount = 3; // Learn after 3 queries to same subtopic
    this.maxKeywordsPerSubtopic = 50;
    this.reloadCallback = reloadCallback; // Callback to notify server to reload
  }
  
  /**
   * Record a successful query-to-subtopic match
   */
  recordQuery(keywords, topicName, subtopicName, relevance) {
    this.learningLog.push({
      timestamp: Date.now(),
      keywords: keywords,
      topic: topicName,
      subtopic: subtopicName,
      relevance: relevance
    });
    
    // Learn if we have enough data
    if (this.learningLog.length >= this.minQueryCount) {
      this.learnFromQueries();
    }
  }
  
  /**
   * Analyze query patterns and add new keywords
   */
  learnFromQueries() {
    // Group queries by subtopic
    const subtopicQueries = new Map();
    
    for (const entry of this.learningLog) {
      const key = `${entry.topic}::${entry.subtopic}`;
      if (!subtopicQueries.has(key)) {
        subtopicQueries.set(key, []);
      }
      subtopicQueries.get(key).push(entry);
    }
    
    // Find keywords that frequently lead to same subtopic
    for (const [key, queries] of subtopicQueries.entries()) {
      if (queries.length < this.minQueryCount) continue;
      
      const [topicName, subtopicName] = key.split('::');
      
      // Count keyword frequency
      const keywordFreq = new Map();
      for (const query of queries) {
        for (const keyword of query.keywords) {
          keywordFreq.set(keyword, (keywordFreq.get(keyword) || 0) + 1);
        }
      }
      
      // Find keywords that appear in majority of queries
      const threshold = Math.ceil(queries.length * 0.6); // 60% threshold
      const newKeywords = [];
      
      for (const [keyword, count] of keywordFreq.entries()) {
        if (count >= threshold && keyword.length >= 3) {
          newKeywords.push(keyword);
        }
      }
      
      if (newKeywords.length > 0) {
        this.addKeywordsToSubtopic(topicName, subtopicName, newKeywords);
      }
    }
    
    // Clear old logs (keep last 100)
    if (this.learningLog.length > 100) {
      this.learningLog = this.learningLog.slice(-100);
    }
  }
  
  /**
   * Add new keywords to a subtopic
   */
  addKeywordsToSubtopic(topicName, subtopicName, newKeywords) {
    const topicDirName = topicName.toLowerCase().replace(/\s+/g, '-');
    const subtopicFileName = subtopicName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/\//g, '-')
      .replace(/[^a-z0-9-]/g, '') + '.json';
    
    const filepath = path.join(this.topicsDir, topicDirName, subtopicFileName);
    
    if (!fs.existsSync(filepath)) return;
    
    const subtopicData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    
    // Add new keywords (avoid duplicates)
    const existingKeywords = new Set(subtopicData.keywords || []);
    let added = 0;
    
    for (const keyword of newKeywords) {
      if (!existingKeywords.has(keyword) && 
          subtopicData.keywords.length < this.maxKeywordsPerSubtopic) {
        subtopicData.keywords.push(keyword);
        added++;
      }
    }
    
    if (added > 0) {
      fs.writeFileSync(filepath, JSON.stringify(subtopicData, null, 2));
      console.log(`[KeywordLearner] Added ${added} keywords to ${topicName} → ${subtopicName}: ${newKeywords.join(', ')}`);
      
      // Notify server to reload the updated topic file
      if (this.reloadCallback) {
        this.reloadCallback(topicName);
      }
    }
  }
  
  /**
   * Get learning statistics
   */
  getStats() {
    return {
      totalQueries: this.learningLog.length,
      uniqueSubtopics: new Set(this.learningLog.map(e => `${e.topic}::${e.subtopic}`)).size,
      recentQueries: this.learningLog.slice(-10)
    };
  }
}

module.exports = KeywordLearner;
