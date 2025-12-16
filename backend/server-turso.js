const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Turso client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// Health check
app.get('/health', async (req, res) => {
  try {
    const result = await db.execute('SELECT COUNT(*) as count FROM papers');
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      papers: result.rows[0].count,
      database: 'turso'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Get all topics with counts
app.get('/api/topics', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT 
        topic,
        subtopic,
        COUNT(*) as count
      FROM papers
      GROUP BY topic, subtopic
      ORDER BY topic, subtopic
    `);
    
    // Group by topic
    const topics = {};
    for (const row of result.rows) {
      if (!topics[row.topic]) {
        topics[row.topic] = {
          name: row.topic,
          subtopics: []
        };
      }
      topics[row.topic].subtopics.push({
        name: row.subtopic,
        count: row.count
      });
    }
    
    res.json(Object.values(topics));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search papers
app.get('/api/search', async (req, res) => {
  try {
    const { query, topic, subtopic, year_min, year_max, limit = 50 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    let sql = `
      SELECT 
        p.id,
        p.title,
        p.abstract,
        p.authors,
        p.year,
        p.topic,
        p.subtopic,
        p.keywords
      FROM papers_fts
      JOIN papers p ON papers_fts.rowid = p.rowid
      WHERE papers_fts MATCH ?
    `;
    
    const params = [query];
    
    if (topic) {
      sql += ' AND p.topic = ?';
      params.push(topic);
    }
    
    if (subtopic) {
      sql += ' AND p.subtopic = ?';
      params.push(subtopic);
    }
    
    if (year_min) {
      sql += ' AND p.year >= ?';
      params.push(parseInt(year_min));
    }
    
    if (year_max) {
      sql += ' AND p.year <= ?';
      params.push(parseInt(year_max));
    }
    
    sql += ` ORDER BY rank LIMIT ?`;
    params.push(parseInt(limit));
    
    const result = await db.execute({ sql, args: params });
    
    // Parse JSON fields
    const papers = result.rows.map(row => ({
      ...row,
      authors: JSON.parse(row.authors || '[]'),
      keywords: JSON.parse(row.keywords || '[]')
    }));
    
    res.json({
      query,
      count: papers.length,
      papers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get papers by topic/subtopic
app.get('/api/papers/:topic/:subtopic', async (req, res) => {
  try {
    const { topic, subtopic } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.execute({
      sql: `
        SELECT 
          id, title, abstract, authors, year, keywords
        FROM papers
        WHERE topic = ? AND subtopic = ?
        ORDER BY year DESC
        LIMIT ? OFFSET ?
      `,
      args: [topic, subtopic, parseInt(limit), parseInt(offset)]
    });
    
    const papers = result.rows.map(row => ({
      ...row,
      authors: JSON.parse(row.authors || '[]'),
      keywords: JSON.parse(row.keywords || '[]')
    }));
    
    res.json({
      topic,
      subtopic,
      count: papers.length,
      papers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [total, topics, years] = await Promise.all([
      db.execute('SELECT COUNT(*) as count FROM papers'),
      db.execute('SELECT COUNT(DISTINCT topic) as count FROM papers'),
      db.execute('SELECT MIN(year) as min, MAX(year) as max FROM papers WHERE year IS NOT NULL')
    ]);
    
    res.json({
      totalPapers: total.rows[0].count,
      totalTopics: topics.rows[0].count,
      yearRange: {
        min: years.rows[0].min,
        max: years.rows[0].max
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get paper by ID
app.get('/api/paper/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.execute({
      sql: 'SELECT * FROM papers WHERE id = ?',
      args: [id]
    });
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    
    const paper = {
      ...result.rows[0],
      authors: JSON.parse(result.rows[0].authors || '[]'),
      keywords: JSON.parse(result.rows[0].keywords || '[]')
    };
    
    res.json(paper);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate relevance score for a paper
function calculateRelevance(paper, keywords, ftsRank) {
  let score = 0;
  
  // FTS rank contribution (0-5 points, lower rank = higher score)
  const rankScore = Math.max(0, 5 - (ftsRank * 0.1));
  score += rankScore;
  
  // Keyword matches in title (0-3 points)
  const titleLower = (paper.title || '').toLowerCase();
  const titleMatches = keywords.filter(kw => titleLower.includes(kw)).length;
  score += Math.min(3, titleMatches * 0.5);
  
  // Keyword matches in abstract (0-2 points)
  const abstractLower = (paper.abstract || '').toLowerCase();
  const abstractMatches = keywords.filter(kw => abstractLower.includes(kw)).length;
  score += Math.min(2, abstractMatches * 0.3);
  
  // Normalize to 1-10 scale
  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

// Legacy endpoint for frontend compatibility with relevance scoring and filters
app.post('/api/get-sources', async (req, res) => {
  try {
    const { 
      claim, 
      limit = 50, 
      offset = 0,
      filters = {} 
    } = req.body;
    
    if (!claim || typeof claim !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid input. Provide a claim string.' 
      });
    }
    
    const startTime = Date.now();
    
    // Extract keywords from claim
    const words = claim.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const stopWords = ['the', 'and', 'that', 'this', 'with', 'from', 'have', 'been', 'were', 'are', 'for', 'can', 'will', 'but', 'not'];
    const keywords = words.filter(word => !stopWords.includes(word));
    
    if (keywords.length === 0) {
      return res.json({
        domain: 'Space Science',
        topic: null,
        subtopic: null,
        sources: [],
        totalSources: 0,
        hasMore: false,
        queryTime: Date.now() - startTime,
        message: 'No keywords extracted from claim'
      });
    }
    
    // Use FTS search with keywords - get more results for relevance scoring
    const query = keywords.join(' OR ');
    const fetchLimit = 200; // Fetch more to calculate relevance
    
    const result = await db.execute({
      sql: `
        SELECT 
          p.id,
          p.title,
          p.abstract,
          p.authors,
          p.year,
          p.topic,
          p.subtopic,
          p.keywords
        FROM papers_fts
        JOIN papers p ON papers_fts.rowid = p.rowid
        WHERE papers_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      args: [query, fetchLimit]
    });
    
    if (result.rows.length === 0) {
      return res.json({
        domain: 'Space Science',
        topic: null,
        subtopic: null,
        sources: [],
        totalSources: 0,
        hasMore: false,
        queryTime: Date.now() - startTime,
        message: 'No matching papers found'
      });
    }
    
    // Calculate relevance scores and format for frontend
    const sourcesWithRelevance = result.rows.map((row, index) => {
      let authorsStr = '';
      try {
        const authorsData = JSON.parse(row.authors || '[]');
        authorsStr = Array.isArray(authorsData) ? authorsData.join(', ') : String(authorsData);
      } catch {
        authorsStr = row.authors || 'Unknown';
      }
      
      const relevance = calculateRelevance(row, keywords, index);
      
      return {
        type: 'paper',
        title: row.title,
        abstract: row.abstract,
        authors: authorsStr,
        year: row.year,
        arxiv: row.id,
        url: `https://arxiv.org/abs/${row.id}`,
        publicationDate: row.year ? `${row.year}` : null,
        relevance: relevance
      };
    });
    
    // Sort by relevance score (highest first)
    sourcesWithRelevance.sort((a, b) => b.relevance - a.relevance);
    
    // Paginate results
    const paginatedSources = sourcesWithRelevance.slice(offset, offset + limit);
    const hasMore = offset + limit < sourcesWithRelevance.length;
    
    // Get most common topic from results
    const topicCounts = {};
    result.rows.forEach(row => {
      topicCounts[row.topic] = (topicCounts[row.topic] || 0) + 1;
    });
    const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];
    
    // Get most common subtopic
    const subtopicCounts = {};
    result.rows.forEach(row => {
      if (row.topic === topTopic[0]) {
        subtopicCounts[row.subtopic] = (subtopicCounts[row.subtopic] || 0) + 1;
      }
    });
    const topSubtopic = Object.entries(subtopicCounts).sort((a, b) => b[1] - a[1])[0];
    
    res.json({
      domain: 'Space Science',
      topic: topTopic[0],
      subtopic: topSubtopic[0],
      relevance: keywords.length,
      sources: paginatedSources,
      totalSources: sourcesWithRelevance.length,
      returnedSources: paginatedSources.length,
      hasMore: hasMore,
      queryTime: Date.now() - startTime,
      message: `Found ${sourcesWithRelevance.length} source(s) in ${topTopic[0]} → ${topSubtopic[0]}`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📊 Database: Turso (SQLite at the edge)`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`🔍 Search: http://localhost:${PORT}/api/search?query=black+holes\n`);
});
