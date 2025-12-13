# Turso Migration Guide

## Step 1: Install Turso CLI

**Windows (PowerShell):**
```powershell
irm get.turso.tech/install.ps1 | iex
```

**Mac/Linux:**
```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

**Verify installation:**
```bash
turso --version
```

---

## Step 2: Create Turso Account and Database

```bash
# Sign up (opens browser)
turso auth signup

# Create database
turso db create space-science-db

# Get database URL
turso db show space-science-db --url

# Create auth token
turso db tokens create space-science-db
```

**Save these values:**
- Database URL: `libsql://space-science-db-[username].turso.io`
- Auth Token: `eyJhbGc...` (long string)

---

## Step 3: Set Environment Variables

Create `.env` file in project root:

```bash
# Turso credentials
TURSO_DATABASE_URL=libsql://space-science-db-[username].turso.io
TURSO_AUTH_TOKEN=eyJhbGc...your-token-here

# Server config
PORT=3000
NODE_ENV=development
```

---

## Step 4: Run Migration

**This will take 5-10 minutes for 998K papers.**

```bash
node scripts/migrate-to-turso.js
```

**Expected output:**
```
=== Turso Migration ===

Creating schema...
✓ Schema created

Migrating 14 topics...

📁 black-holes/accretion-disks: 8623 papers
   ✓ Complete: 8623 papers
📁 black-holes/event-horizons: 42270 papers
   ✓ Complete: 42270 papers
...

=== Building Full-Text Search Index ===
This may take 2-3 minutes...
✓ FTS index built

=== Migration Summary ===
Topics:     14
Subtopics:  84
Papers:     998,538
Verified:   998,538 papers in database

✅ Migration complete!
```

---

## Step 5: Test Locally

```bash
# Start new Turso-based server
node backend/server-turso.js
```

**Test endpoints:**

```bash
# Health check
curl http://localhost:3000/health

# Get topics
curl http://localhost:3000/api/topics

# Search
curl "http://localhost:3000/api/search?query=black+holes&limit=10"

# Get stats
curl http://localhost:3000/api/stats
```

---

## Step 6: Update package.json

```json
{
  "scripts": {
    "start": "node backend/server-turso.js",
    "start:old": "node backend/server.js",
    "migrate": "node scripts/migrate-to-turso.js"
  }
}
```

---

## Step 7: Deploy to Railway

```bash
# Set environment variables in Railway
railway variables set TURSO_DATABASE_URL="libsql://..."
railway variables set TURSO_AUTH_TOKEN="eyJhbGc..."
railway variables set PORT=3000

# Update start command in railway.json
# Change: "node backend/server.js"
# To: "node backend/server-turso.js"

# Deploy
railway up
```

---

## Verification Checklist

- [ ] Turso CLI installed
- [ ] Database created
- [ ] Environment variables set
- [ ] Migration completed (998,538 papers)
- [ ] FTS index built
- [ ] Local server starts
- [ ] Search endpoint works
- [ ] Topics endpoint works
- [ ] Railway variables set
- [ ] Railway deployed

---

## Troubleshooting

### "Missing environment variables"
```bash
# Check .env file exists
cat .env

# Verify variables are set
echo $TURSO_DATABASE_URL
echo $TURSO_AUTH_TOKEN
```

### "Migration fails at X papers"
```bash
# Migration uses INSERT OR IGNORE
# Safe to re-run - will skip existing papers
node scripts/migrate-to-turso.js
```

### "FTS index error"
```bash
# Rebuild FTS index manually
turso db shell space-science-db

# In Turso shell:
DELETE FROM papers_fts;
INSERT INTO papers_fts(rowid, title, abstract)
SELECT rowid, title, abstract FROM papers;
```

### "Slow queries"
```bash
# Check indexes exist
turso db shell space-science-db

# In Turso shell:
.indexes papers
# Should show: idx_topic, idx_topic_subtopic, idx_year
```

---

## Performance Comparison

| Metric | Old (JSON) | New (Turso) |
|--------|-----------|-------------|
| Startup time | 1.3s | <100ms |
| Search latency | 50-100ms | 20-50ms |
| Memory usage | 2GB | 200MB |
| Storage cost | $5/month | FREE |
| Global latency | Single region | Edge (fast globally) |

---

## Database Schema

```sql
-- Main table
CREATE TABLE papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT,
  authors TEXT,           -- JSON array
  year INTEGER,
  topic TEXT NOT NULL,
  subtopic TEXT NOT NULL,
  keywords TEXT,          -- JSON array
  created_at INTEGER
);

-- Indexes
CREATE INDEX idx_topic_subtopic ON papers(topic, subtopic);
CREATE INDEX idx_year ON papers(year);
CREATE INDEX idx_topic ON papers(topic);

-- Full-text search
CREATE VIRTUAL TABLE papers_fts USING fts5(
  title,
  abstract,
  content='papers',
  content_rowid='rowid'
);
```

---

## Next Steps After Migration

1. **Delete old JSON files** (save 1.5GB disk space)
   ```bash
   # Backup first
   tar -czf database-backup.tar.gz database/
   
   # Then delete
   rm -rf database/topics/
   ```

2. **Update .gitignore**
   ```
   # Remove (no longer needed)
   database/topics/
   database/topics-backup/
   ```

3. **Update README.md**
   - Change "JSON files" to "Turso database"
   - Update deployment instructions
   - Add Turso setup link

4. **Commit changes**
   ```bash
   git add backend/server-turso.js scripts/migrate-to-turso.js
   git add TURSO_SETUP.md package.json
   git commit -m "Migrate to Turso database"
   git push origin main
   ```

---

## Cost Analysis

**Before (Railway Volumes):**
- Storage: $5/month
- Compute: Included
- **Total: $5/month**

**After (Turso):**
- Storage: FREE (9GB limit)
- Compute: FREE (1B reads/month)
- **Total: $0/month**

**Savings: $60/year**

---

## Rollback Plan

If migration fails, you can rollback:

```bash
# Use old server
npm run start:old

# Or in Railway
railway variables set START_COMMAND="node backend/server.js"
```

Your JSON files are still intact until you delete them.
