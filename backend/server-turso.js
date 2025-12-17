const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Production database (for search/read operations)
const productionDb = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Staging database (for collaborative paper addition) - optional
let stagingDb = null;
if (process.env.TURSO_STAGING_URL && process.env.TURSO_STAGING_TOKEN) {
  stagingDb = createClient({
    url: process.env.TURSO_STAGING_URL,
    authToken: process.env.TURSO_STAGING_TOKEN
  });
  console.log('✅ Staging database connected');
} else {
  console.log('⚠️  Staging database not configured - admin features disabled');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// Simple health check (fast response for Railway)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Detailed health check with database stats
app.get('/health/detailed', async (req, res) => {
  try {
    const prodResult = await productionDb.execute('SELECT COUNT(*) as count FROM papers');
    
    const response = {
      status: 'ok',
      uptime: process.uptime(),
      production: {
        papers: prodResult.rows[0].count,
        database: 'turso-production'
      }
    };
    
    // Add staging info if available
    if (stagingDb) {
      const stagingResult = await stagingDb.execute('SELECT COUNT(*) as count FROM papers');
      response.staging = {
        papers: stagingResult.rows[0].count,
        database: 'turso-staging'
      };
    } else {
      response.staging = {
        status: 'not-configured'
      };
    }
    
    res.json(response);
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
    const result = await productionDb.execute(`
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
    
    const result = await productionDb.execute({ sql, args: params });
    
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
    
    const result = await productionDb.execute({
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
      productionDb.execute('SELECT COUNT(*) as count FROM papers'),
      productionDb.execute('SELECT COUNT(DISTINCT topic) as count FROM papers'),
      productionDb.execute('SELECT MIN(year) as min, MAX(year) as max FROM papers WHERE year IS NOT NULL')
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
    
    const result = await productionDb.execute({
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
    
    // Build SQL query with filters
    const query = keywords.join(' OR ');
    const fetchLimit = 200;
    
    let sql = `
      SELECT 
        p.id,
        p.title,
        p.abstract,
        p.authors,
        p.year,
        p.topic,
        p.subtopic,
        p.keywords,
        p.source
      FROM papers_fts
      JOIN papers p ON papers_fts.rowid = p.rowid
      WHERE papers_fts MATCH ?
    `;
    
    const args = [query];
    
    // Apply filters
    if (filters.yearMin) {
      sql += ' AND p.year >= ?';
      args.push(parseInt(filters.yearMin));
    }
    
    if (filters.yearMax) {
      sql += ' AND p.year <= ?';
      args.push(parseInt(filters.yearMax));
    }
    
    if (filters.topic) {
      sql += ' AND p.topic = ?';
      args.push(filters.topic);
    }
    
    if (filters.subtopic) {
      sql += ' AND p.subtopic = ?';
      args.push(filters.subtopic);
    }
    
    if (filters.source) {
      sql += ' AND p.source = ?';
      args.push(filters.source);
    }
    
    sql += ' ORDER BY rank LIMIT ?';
    args.push(fetchLimit);
    
    const result = await productionDb.execute({ sql, args });
    
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
      const source = row.source || 'arxiv';
      
      // Generate correct URL based on source
      let url, paperId;
      if (source === 'nasa-ads') {
        // NASA ADS bibcode - encode & as %26 for URL
        paperId = row.id;
        url = `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(row.id)}/abstract`;
      } else {
        // arXiv ID
        paperId = row.id;
        url = `https://arxiv.org/abs/${row.id}`;
      }
      
      return {
        type: 'paper',
        title: row.title,
        abstract: row.abstract,
        authors: authorsStr,
        year: row.year,
        paperId: paperId,
        url: url,
        publicationDate: row.year ? `${row.year}` : null,
        relevance: relevance,
        source: source,
        topic: row.topic,
        subtopic: row.subtopic
      };
    });
    
    // Sort by relevance score (highest first)
    sourcesWithRelevance.sort((a, b) => b.relevance - a.relevance);
    
    // Apply relevance filter if specified
    let filteredSources = sourcesWithRelevance;
    if (filters.minRelevance) {
      const minRel = parseFloat(filters.minRelevance);
      filteredSources = sourcesWithRelevance.filter(s => s.relevance >= minRel);
    }
    
    // Paginate results
    const paginatedSources = filteredSources.slice(offset, offset + limit);
    const hasMore = offset + limit < filteredSources.length;
    
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
      totalSources: filteredSources.length,
      returnedSources: paginatedSources.length,
      hasMore: hasMore,
      queryTime: Date.now() - startTime,
      message: `Found ${sourcesWithRelevance.length} source(s) in ${topTopic[0]} → ${topSubtopic[0]}`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available filter options
app.get('/api/filters', async (req, res) => {
  try {
    // Get all topics with their subtopics
    const result = await productionDb.execute(`
      SELECT DISTINCT topic, subtopic
      FROM papers
      ORDER BY topic, subtopic
    `);
    
    // Group by topic
    const topics = {};
    result.rows.forEach(row => {
      if (!topics[row.topic]) {
        topics[row.topic] = [];
      }
      topics[row.topic].push(row.subtopic);
    });
    
    // Get year range
    const yearResult = await productionDb.execute(`
      SELECT MIN(year) as min, MAX(year) as max
      FROM papers
      WHERE year IS NOT NULL
    `);
    
    // Get source counts
    const sourceResult = await productionDb.execute(`
      SELECT source, COUNT(*) as count
      FROM papers
      GROUP BY source
    `);
    
    res.json({
      topics: topics,
      yearRange: {
        min: yearResult.rows[0].min,
        max: yearResult.rows[0].max
      },
      sources: sourceResult.rows.map(r => ({
        value: r.source,
        label: r.source === 'arxiv' ? 'arXiv' : 'NASA ADS',
        count: r.count
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin API: Add paper
app.post('/api/admin/add-paper', async (req, res) => {
  if (!stagingDb) {
    return res.status(503).json({ error: 'Staging database not configured' });
  }
  
  try {
    const { paperId, topic, subtopic = 'other', source } = req.body;
    
    if (!paperId || !topic) {
      return res.status(400).json({ error: 'paperId and topic are required' });
    }
    
    // Check if paper already exists in staging DB
    const existing = await stagingDb.execute({
      sql: 'SELECT id FROM papers WHERE id = ?',
      args: [paperId]
    });
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Paper already exists in database' });
    }
    
    // Detect source from paper ID format
    let detectedSource = source;
    if (!detectedSource) {
      // arXiv format: YYMM.NNNNN or archive/YYMMNNN
      // NASA ADS format: YYYYJournal...Volume..Page (contains letters and dots)
      detectedSource = /^(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})$/i.test(paperId) ? 'arxiv' : 'nasa-ads';
    }
    
    // Fetch paper metadata based on source
    let paperData;
    if (detectedSource === 'arxiv') {
      paperData = await fetchArxivMetadata(paperId);
    } else {
      paperData = await fetchNASAADSMetadata(paperId);
    }
    
    if (!paperData) {
      return res.status(404).json({ error: 'Paper not found in source database' });
    }
    
    // Insert paper into staging database
    await stagingDb.execute({
      sql: `
        INSERT INTO papers (id, title, abstract, authors, year, topic, subtopic, keywords, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        paperId,
        paperData.title,
        paperData.abstract,
        JSON.stringify(paperData.authors),
        paperData.year,
        topic,
        subtopic,
        JSON.stringify(paperData.keywords || []),
        detectedSource
      ]
    });
    
    res.json({
      success: true,
      message: 'Paper added successfully',
      paper: {
        id: paperId,
        title: paperData.title,
        source: detectedSource,
        topic,
        subtopic
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin API: Get recent papers
app.get('/api/admin/recent', async (req, res) => {
  if (!stagingDb) {
    return res.status(503).json({ error: 'Staging database not configured' });
  }
  
  try {
    const { limit = 10 } = req.query;
    
    const result = await stagingDb.execute({
      sql: `
        SELECT id, title, topic, subtopic, source, year
        FROM papers
        ORDER BY rowid DESC
        LIMIT ?
      `,
      args: [parseInt(limit)]
    });
    
    res.json({
      papers: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin API: Get statistics
app.get('/api/admin/stats', async (req, res) => {
  if (!stagingDb) {
    return res.status(503).json({ error: 'Staging database not configured' });
  }
  
  try {
    const [total] = await Promise.all([
      stagingDb.execute('SELECT COUNT(*) as count FROM papers')
    ]);
    
    res.json({
      totalPapers: total.rows[0].count,
      todayAdded: 0, // TODO: Track additions with timestamp
      activeUsers: 1  // TODO: Track active sessions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Fetch arXiv metadata
async function fetchArxivMetadata(arxivId) {
  try {
    const response = await fetch(`http://export.arxiv.org/api/query?id_list=${arxivId}`);
    const xml = await response.text();
    
    // Check if paper exists (look for entry tag)
    if (!xml.includes('<entry>')) {
      return null;
    }
    
    // Extract entry content (skip feed-level title)
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) {
      return null;
    }
    
    const entry = entryMatch[1];
    
    // Parse entry fields
    const titleMatch = entry.match(/<title>(.*?)<\/title>/s);
    const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/s);
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
    const authorsMatch = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g);
    
    if (!titleMatch) {
      return null;
    }
    
    const authors = authorsMatch 
      ? authorsMatch.map(a => a.match(/<name>(.*?)<\/name>/)[1].trim())
      : [];
    
    const year = publishedMatch 
      ? parseInt(publishedMatch[1].substring(0, 4))
      : null;
    
    return {
      title: titleMatch[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' '),
      abstract: summaryMatch ? summaryMatch[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' ') : '',
      authors,
      year,
      keywords: []
    };
  } catch (error) {
    console.error('Error fetching arXiv metadata:', error);
    return null;
  }
}

// Helper: Fetch NASA ADS metadata
async function fetchNASAADSMetadata(bibcode) {
  try {
    const apiKey = process.env.NASA_ADS_API_KEY;
    if (!apiKey) {
      throw new Error('NASA_ADS_API_KEY not configured');
    }
    
    const response = await fetch(`https://api.adsabs.harvard.edu/v1/search/query?q=bibcode:${encodeURIComponent(bibcode)}&fl=title,abstract,author,year,keyword`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    const data = await response.json();
    
    if (!data.response || data.response.numFound === 0) {
      return null;
    }
    
    const doc = data.response.docs[0];
    
    return {
      title: doc.title ? doc.title[0] : '',
      abstract: doc.abstract || '',
      authors: doc.author || [],
      year: doc.year || null,
      keywords: doc.keyword || []
    };
  } catch (error) {
    console.error('Error fetching NASA ADS metadata:', error);
    return null;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📊 Database: Turso (SQLite at the edge)`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`🔍 Search: http://localhost:${PORT}/api/search?query=black+holes\n`);
});
