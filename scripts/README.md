# Data Ingestion Scripts

Clean, minimal scripts for ingesting papers into the topic-based database.

## Architecture

Papers are stored in **separate JSON files per topic** in `database/topics/`:
- `black-holes.json`
- `neutron-stars.json`
- `dark-matter-and-dark-energy.json`
- etc.

Each topic file contains subtopics with papers and auto-generated keywords for search.

## Scripts

### 1. `ingest-arxiv.js` - Import arXiv Bulk Data

Parses arXiv bulk snapshot and saves papers directly to topic files.

**Usage:**
```bash
node scripts/ingest-arxiv.js <path-to-arxiv-snapshot.json>
```

**Example:**
```bash
node scripts/ingest-arxiv.js arxiv-bulk/arxiv-metadata-oai-snapshot.json
```

**What it does:**
- Streams through arXiv JSON (handles 5GB+ files)
- Filters for space science papers (astro-ph, gr-qc categories)
- Classifies papers into topics and subtopics
- Appends to existing topic files (incremental)
- ~454K papers from 2.9M total arXiv entries

---

### 2. `ingest-nasa-ads.js` - Fetch from NASA ADS API

Fetches papers from NASA ADS API and saves to topic files.

**Usage:**
```bash
node scripts/ingest-nasa-ads.js <api-key> [max-requests]
```

**Example:**
```bash
node scripts/ingest-nasa-ads.js aOtKgyveM1U0JMc3ejjChwc1fOdlbrVs4pt9B9ck 5000
```

**What it does:**
- Queries NASA ADS with diverse search terms
- Respects rate limits (5,000 requests/day per key)
- Classifies and saves papers to topic files
- Handles rate limiting automatically (waits 60s)
- ~500K papers per key per day

**API Keys:**
- Key 1: `aOtKgyveM1U0JMc3ejjChwc1fOdlbrVs4pt9B9ck`
- Key 2: `EenynivOj8rHRDG83aLVRFVE5TE0QuRF8I8hFkJH`
- Key 3: `5TRvUhg5bJ1kHp0qrOCQU9T0aQcmCdUQMzqX17Tm`
- Key 4: `sLyr3Z58BE3tMn3kPhuBf0iBTb94hj1TvttlpuF5`
- Key 5: `duPa2VPusEhpcPbLaDxRKoNHVwZZ1XlToFvhoYuW`
- Key 6: `BOTfCPNVtKKVP8iPduqvwJ34ZcSZfAaO2OOk6gx7`

---

### 3. `build-index.js` - Generate Search Keywords

Generates keywords for all subtopics and updates metadata.

**Usage:**
```bash
node scripts/build-index.js
```

**What it does:**
- Extracts keywords from paper titles/abstracts
- Generates 2-word phrases ("neutron star", "black hole")
- Updates all topic files with keywords
- Regenerates `_metadata.json` with stats
- **Run this after any ingestion**

---

## Workflow

### Initial Setup (from scratch)
```bash
# 1. Ingest arXiv bulk data
node scripts/ingest-arxiv.js path/to/arxiv-snapshot.json

# 2. Fetch from NASA ADS (optional, for more papers)
node scripts/ingest-nasa-ads.js YOUR_API_KEY 5000

# 3. Build search index
node scripts/build-index.js

# 4. Start server
npm start
```

### Adding More Papers
```bash
# Fetch more from NASA ADS
node scripts/ingest-nasa-ads.js YOUR_API_KEY 5000

# Rebuild index
node scripts/build-index.js

# Restart server
npm start
```

---

## NPM Scripts

```bash
npm start              # Start backend server
npm run ingest:arxiv   # Alias for ingest-arxiv.js
npm run ingest:nasa    # Alias for ingest-nasa-ads.js
npm run build          # Alias for build-index.js
```

---

## File Structure

```
database/
  topics/
    _metadata.json              # Domain metadata and stats
    black-holes.json            # 66,902 papers
    neutron-stars.json          # 35,411 papers
    dark-matter-and-dark-energy.json
    exoplanets.json
    galaxies.json               # 231,694 papers (largest)
    cosmology.json
    star-formation.json
    gravitational-waves.json
    solar-physics.json
    planetary-science.json
    small-bodies.json
    stellar-astrophysics.json
    high-energy-astrophysics.json
    instrumentation-and-methods.json
```

Each topic file:
```json
{
  "topic": "Neutron Stars",
  "subtopics": [
    {
      "name": "Mass Limits",
      "keywords": ["neutron star", "neutron stars", "mass", ...],
      "sources": [
        {
          "type": "paper",
          "title": "...",
          "authors": "...",
          "arxiv": "1234.5678",
          "doi": "...",
          "journal": "...",
          "publicationDate": "...",
          "citationCount": 42,
          "abstract": "...",
          "url": "https://arxiv.org/abs/1234.5678"
        }
      ]
    }
  ]
}
```

---

## Current Database Stats

- **Total papers:** 971,964
- **Topics:** 14
- **Subtopics:** 70
- **Date range:** 2000-2020
- **Sources:** arXiv (454K) + NASA ADS (517K)

---

## Notes

- **Incremental:** All scripts append to existing files (safe to re-run)
- **Deduplication:** Papers are deduplicated by arxivId/bibcode
- **Classification:** Keyword-based pattern matching (simple but effective)
- **Scalability:** Topic-based files avoid Node.js string length limits
- **Search:** Phrase-aware keyword matching with topic boosting
