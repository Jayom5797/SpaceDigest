# Space Science Reference Database - Module 2

A hierarchical database of 998,538 space science papers (2000-2020) with intelligent keyword-based search and dynamic learning capabilities.

## 🚀 Features

- **998K+ Papers**: arXiv + NASA ADS sources
- **14 Topics, 84 Subtopics**: Hierarchical classification
- **Intelligent Search**: Phrase-aware keyword matching with topic boosting
- **Dynamic Learning**: System learns from user queries to improve accuracy
- **Scalable Architecture**: Per-subtopic files, lazy-loading, streaming
- **Fast**: 1.3s startup, <100ms search response

## 📊 Database Stats

- **Total Papers**: 998,538
- **Date Range**: 2000-2020
- **Topics**: Black Holes, Neutron Stars, Galaxies, Exoplanets, Dark Matter, Cosmology, etc.
- **Sources**: arXiv (454K) + NASA ADS (544K)

## 🏗️ Architecture

```
database/topics/
├── black-holes/
│   ├── event-horizons.json
│   ├── hawking-radiation.json
│   └── ...
├── galaxies/
│   ├── formation-and-evolution.json
│   ├── structure.json
│   └── ...
└── ... (12 more topics)
```

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- 8GB RAM minimum
- 2GB disk space for database

### Installation

```bash
# Install dependencies
npm install

# Download database (hosted separately due to size)
# See DEPLOYMENT.md for database hosting instructions

# Start backend
npm start

# Backend runs at http://localhost:3000
```

### Environment Variables

Create `.env` file:
```
PORT=3000
DATABASE_PATH=./database/topics
```

## 📡 API Endpoints

### POST /api/get-sources
Search for papers matching a claim

**Request:**
```json
{
  "claim": "black holes emit Hawking radiation"
}
```

**Response:**
```json
{
  "domain": "Space Science",
  "topic": "Black Holes",
  "subtopic": "Hawking Radiation",
  "relevance": 15,
  "sources": [...],
  "totalSources": 50,
  "queryTime": 45
}
```

### GET /api/stats
Get database statistics

### GET /api/topics
List all topics and subtopics

### GET /api/learning-stats
View keyword learning statistics

## 🔧 Scripts

```bash
# Build search index (regenerate keywords)
npm run build

# Ingest arXiv bulk data
node scripts/ingest-arxiv.js

# Ingest NASA ADS data
node scripts/ingest-nasa-ads.js

# Deduplicate database
node scripts/deduplicate-database.js
```

## 📈 Performance

- **Startup Time**: 1.3 seconds
- **Search Time**: <100ms
- **Memory Usage**: <2GB
- **Index Build**: ~5 minutes for 1M papers

## 🎯 Search Accuracy

- **86% accuracy** on test queries
- **Phrase matching**: 2-3 word phrases with 5x weight
- **Topic boosting**: 10x weight for topic name matches
- **Dynamic learning**: Improves over time based on user queries

## 🔄 Dynamic Keyword Learning

The system automatically learns from user queries:
1. Records all searches with matched topics
2. After 3 queries to same subtopic, analyzes patterns
3. Adds keywords appearing in 60%+ of queries
4. Updates live without restart

## 📦 Deployment

See `DEPLOYMENT.md` for detailed deployment instructions.

**Quick Deploy:**
- Backend: Railway (Node.js + database)
- Frontend: Vercel (static site)
- Database: AWS S3 or Railway volumes

## 🏛️ Architecture Decisions

### Per-Subtopic Files
- **Why**: Node.js has 512MB string limit for JSON.parse()
- **Benefit**: Can process 8M+ papers without crashes
- **Trade-off**: More files, but manageable

### Lazy Loading
- **Why**: Loading 1M papers at startup is slow
- **Benefit**: 1.3s startup vs 30s+ for full load
- **Trade-off**: First query per topic slightly slower

### Keyword-Based Classification
- **Why**: ML would require training data + compute
- **Benefit**: Fast, deterministic, explainable
- **Trade-off**: ~80% accuracy vs 95% with ML

## 🚧 Known Limitations

- **Classification**: Keyword-based (not ML)
- **Date Range**: 2000-2020 only
- **Coverage**: 12.5% of 8M target
- **Language**: English papers only

## 📝 License

MIT

## 🤝 Contributing

This is Module 2 of a larger fact-checking system. Module 3 (claim verification) is not yet implemented.

## 📧 Contact

For questions about data sources or architecture decisions, see `PROJECT-STATUS.md`.
