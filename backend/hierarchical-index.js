/**
 * Hierarchical Index: Domain → Topic → Subtopic → Sources
 * In-memory tree structure for O(1) lookups
 */

class HierarchicalIndex {
  constructor() {
    this.domain = null;
    this.topics = new Map();              // topic_name → Topic object
    this.subtopics = new Map();           // subtopic_name → Subtopic object
    this.keywordIndex = new Map();        // keyword → Set of subtopic_names
    this.sources = new Map();             // source_id → Source object
    
    this.stats = {
      totalTopics: 0,
      totalSubtopics: 0,
      totalSources: 0,
      loadTime: 0
    };
  }
  
  /**
   * Build index from hierarchical JSON
   */
  buildFromJSON(data) {
    const startTime = Date.now();
    console.log('Building hierarchical index...');
    
    this.domain = data.domain;
    
    for (const topicData of data.topics) {
      const topicName = topicData.topic;
      
      // Store topic
      this.topics.set(topicName, {
        name: topicName,
        subtopicCount: topicData.subtopics.length
      });
      
      // Process subtopics
      for (const subtopicData of topicData.subtopics) {
        const subtopicName = subtopicData.name;
        const fullSubtopicKey = `${topicName}::${subtopicName}`;
        
        // Store subtopic
        this.subtopics.set(fullSubtopicKey, {
          name: subtopicName,
          topic: topicName,
          keywords: subtopicData.keywords,
          sourceCount: subtopicData.sources.length
        });
        
        // Index keywords
        for (const keyword of subtopicData.keywords) {
          if (!this.keywordIndex.has(keyword)) {
            this.keywordIndex.set(keyword, new Set());
          }
          this.keywordIndex.get(keyword).add(fullSubtopicKey);
        }
        
        // Store sources
        for (const source of subtopicData.sources) {
          const sourceId = source.arxiv || source.doi || source.title;
          this.sources.set(sourceId, {
            ...source,
            topic: topicName,
            subtopic: subtopicName
          });
        }
      }
    }
    
    this.stats.totalTopics = this.topics.size;
    this.stats.totalSubtopics = this.subtopics.size;
    this.stats.totalSources = this.sources.size;
    this.stats.loadTime = Date.now() - startTime;
    
    console.log(`✓ Index built in ${this.stats.loadTime}ms`);
    console.log(`  Domain: ${this.domain}`);
    console.log(`  Topics: ${this.stats.totalTopics}`);
    console.log(`  Subtopics: ${this.stats.totalSubtopics}`);
    console.log(`  Sources: ${this.stats.totalSources}`);
  }
  
  /**
   * Search sources by keywords with phrase matching and topic boosting
   */
  searchByKeywords(keywords) {
    const subtopicScores = new Map();
    const topicScores = new Map();
    
    // Build phrase combinations (2-word and 3-word phrases)
    const phrases = [];
    for (let i = 0; i < keywords.length - 1; i++) {
      phrases.push(keywords[i] + ' ' + keywords[i + 1]);
      if (i < keywords.length - 2) {
        phrases.push(keywords[i] + ' ' + keywords[i + 1] + ' ' + keywords[i + 2]);
      }
    }
    
    // Score by phrases first (higher weight)
    for (const phrase of phrases) {
      const subtopics = this.keywordIndex.get(phrase.toLowerCase());
      if (subtopics) {
        for (const subtopic of subtopics) {
          const [topic] = subtopic.split('::');
          subtopicScores.set(subtopic, (subtopicScores.get(subtopic) || 0) + 5); // 5x weight for phrases
          topicScores.set(topic, (topicScores.get(topic) || 0) + 5);
        }
      }
    }
    
    // Score by individual keywords
    for (const keyword of keywords) {
      const subtopics = this.keywordIndex.get(keyword.toLowerCase());
      if (subtopics) {
        for (const subtopic of subtopics) {
          const [topic] = subtopic.split('::');
          subtopicScores.set(subtopic, (subtopicScores.get(subtopic) || 0) + 1);
          topicScores.set(topic, (topicScores.get(topic) || 0) + 1);
        }
      }
    }
    
    // Boost subtopics whose topic name matches keywords
    for (const [subtopicKey, score] of subtopicScores.entries()) {
      const [topic] = subtopicKey.split('::');
      const topicWords = topic.toLowerCase().split(/\s+/);
      
      // Check if any keyword matches topic name
      for (const keyword of keywords) {
        if (topicWords.includes(keyword.toLowerCase())) {
          subtopicScores.set(subtopicKey, score + 10); // 10x boost for topic name match
        }
      }
    }
    
    // Sort by relevance
    const rankedSubtopics = Array.from(subtopicScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, score]) => {
        const [topic, subtopic] = key.split('::');
        return { topic, subtopic, relevance: score };
      });
    
    return rankedSubtopics;
  }
  
  /**
   * Get sources by subtopic
   */
  getSourcesBySubtopic(topicName, subtopicName, limit = 100) {
    const sources = [];
    
    for (const [id, source] of this.sources) {
      if (source.topic === topicName && source.subtopic === subtopicName) {
        sources.push(source);
        if (sources.length >= limit) break;
      }
    }
    
    return sources;
  }
  
  /**
   * Get all sources matching keywords (cross-subtopic)
   */
  getAllMatchingSources(keywords, limit = 50) {
    const rankedSubtopics = this.searchByKeywords(keywords);
    const allSources = [];
    
    for (const { topic, subtopic } of rankedSubtopics) {
      const sources = this.getSourcesBySubtopic(topic, subtopic, limit);
      allSources.push(...sources);
      
      if (allSources.length >= limit) break;
    }
    
    return allSources.slice(0, limit);
  }
  
  /**
   * Update a topic with new data (for dynamic keyword learning)
   */
  updateTopic(topicData) {
    const topicName = topicData.topic;
    
    // Remove old keyword indexes for this topic
    for (const [keyword, subtopicSet] of this.keywordIndex.entries()) {
      const toRemove = [];
      for (const subtopicKey of subtopicSet) {
        if (subtopicKey.startsWith(topicName + '::')) {
          toRemove.push(subtopicKey);
        }
      }
      for (const key of toRemove) {
        subtopicSet.delete(key);
      }
      if (subtopicSet.size === 0) {
        this.keywordIndex.delete(keyword);
      }
    }
    
    // Re-index subtopics with updated keywords
    for (const subtopicData of topicData.subtopics) {
      const subtopicName = subtopicData.name;
      const fullSubtopicKey = `${topicName}::${subtopicName}`;
      
      // Update subtopic data
      this.subtopics.set(fullSubtopicKey, {
        name: subtopicName,
        topic: topicName,
        keywords: subtopicData.keywords,
        sourceCount: subtopicData.sources.length
      });
      
      // Re-index keywords
      for (const keyword of subtopicData.keywords) {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, new Set());
        }
        this.keywordIndex.get(keyword).add(fullSubtopicKey);
      }
    }
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return this.stats;
  }
}

module.exports = HierarchicalIndex;
