const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📊 Database: Turso (SQLite at the edge)`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`🔍 Search: http://localhost:${PORT}/api/search?query=black+holes\n`);
});
