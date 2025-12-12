# Deployment Guide

## Overview

The system consists of:
1. **Backend API** (Node.js Express server)
2. **Database** (1.5GB JSON files in per-subtopic structure)
3. **Frontend** (Static HTML/CSS/JS)

## Option A: Railway + Vercel (Recommended)

### Step 1: Prepare Database

The database is too large for Git (1.5GB). Host it separately:

**Option 1: Railway Volumes**
```bash
# Railway will mount a persistent volume
# Upload database via Railway CLI or dashboard
railway volume create database-volume 2GB
railway volume mount database-volume /app/database
```

**Option 2: AWS S3**
```bash
# Upload to S3
aws s3 sync database/topics s3://your-bucket/topics/

# Update backend to download on startup
# Add to backend/server.js before loadIndex()
```

**Option 3: GitHub Release**
```bash
# Compress database
tar -czf database.tar.gz database/topics/

# Upload as GitHub release asset
# Backend downloads on first startup
```

### Step 2: Deploy Backend to Railway

1. **Create Railway Project**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login
   railway login
   
   # Initialize
   railway init
   ```

2. **Configure Environment**
   ```bash
   railway variables set PORT=3000
   railway variables set NODE_ENV=production
   ```

3. **Deploy**
   ```bash
   railway up
   ```

4. **Get Backend URL**
   ```bash
   railway domain
   # Example: https://your-app.railway.app
   ```

### Step 3: Deploy Frontend to Vercel

1. **Update Frontend API URL**
   ```javascript
   // frontend/app.js
   const API_URL = 'https://your-app.railway.app';
   ```

2. **Deploy to Vercel**
   ```bash
   # Install Vercel CLI
   npm install -g vercel
   
   # Deploy
   cd frontend
   vercel --prod
   ```

3. **Configure**
   - Set root directory to `frontend/`
   - Framework: Other
   - Build command: (none)
   - Output directory: `.`

## Option B: Docker + DigitalOcean

### Step 1: Create Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY scripts/ ./scripts/

# Database will be mounted as volume
VOLUME /app/database

EXPOSE 3000

CMD ["node", "backend/server.js"]
```

### Step 2: Build and Push

```bash
# Build image
docker build -t space-science-db .

# Tag for registry
docker tag space-science-db registry.digitalocean.com/your-registry/space-science-db

# Push
docker push registry.digitalocean.com/your-registry/space-science-db
```

### Step 3: Deploy to DigitalOcean

1. Create Droplet (2GB RAM minimum)
2. Attach Volume for database (2GB)
3. Pull and run container
4. Configure nginx reverse proxy

## Option C: Heroku

**⚠️ Not Recommended**: Heroku has 500MB slug size limit. Database is 1.5GB.

## Database Hosting Options

### Option 1: Railway Volumes (Easiest)
- **Pros**: Integrated with backend, persistent
- **Cons**: Costs $5/month for 2GB
- **Setup**: 5 minutes

### Option 2: AWS S3 (Cheapest)
- **Pros**: $0.023/GB/month = $0.03/month
- **Cons**: Need download script, slower startup
- **Setup**: 15 minutes

### Option 3: GitHub Releases (Free)
- **Pros**: Free, version controlled
- **Cons**: 2GB file limit, manual updates
- **Setup**: 10 minutes

### Option 4: PostgreSQL Migration (Best Long-term)
- **Pros**: Proper database, queryable, scalable
- **Cons**: Requires migration script, more complex
- **Setup**: 4-6 hours

## Environment Variables

Required for production:

```bash
# Backend
PORT=3000
NODE_ENV=production
DATABASE_PATH=./database/topics
MAX_OLD_SPACE_SIZE=4096

# Optional: Database download
S3_BUCKET=your-bucket
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

## Performance Tuning

### Railway
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "healthcheckPath": "/api/stats"
  }
}
```

### Memory Settings
```bash
# For 1M papers
NODE_OPTIONS="--max-old-space-size=4096"

# For 8M papers (future)
NODE_OPTIONS="--max-old-space-size=8192"
```

## Monitoring

### Health Check Endpoint
```javascript
// backend/server.js
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    papers: index.getStats().totalSources
  });
});
```

### Logging
```bash
# Railway logs
railway logs

# Or use logging service
npm install winston
```

## Scaling

### Current Capacity
- 1M papers: 2GB RAM, 1 CPU core
- Response time: <100ms
- Concurrent users: ~50

### To Scale to 8M Papers
1. Increase RAM to 8GB
2. Use 2 CPU cores
3. Consider read replicas
4. Add Redis caching

## Cost Estimate

### Railway + Vercel
- Railway: $5/month (Hobby plan)
- Vercel: Free (Hobby plan)
- **Total: $5/month**

### DigitalOcean
- Droplet (2GB): $12/month
- Volume (2GB): $0.20/month
- **Total: $12.20/month**

### AWS (Full Stack)
- EC2 t3.small: $15/month
- S3 storage: $0.03/month
- Data transfer: $1/month
- **Total: $16/month**

## Troubleshooting

### "Cannot find module" errors
```bash
npm ci --only=production
```

### "Out of memory" errors
```bash
NODE_OPTIONS="--max-old-space-size=8192" node backend/server.js
```

### Database not loading
```bash
# Check path
ls -lh database/topics/

# Check permissions
chmod -R 755 database/
```

### Slow startup
- Database is loading all files
- Expected: 1-3 seconds for 1M papers
- If >10 seconds, check disk I/O

## Security

### API Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### CORS Configuration
```javascript
const cors = require('cors');

app.use(cors({
  origin: ['https://your-frontend.vercel.app'],
  methods: ['GET', 'POST'],
  credentials: true
}));
```

## Backup Strategy

### Automated Backups
```bash
# Cron job to backup database
0 2 * * * tar -czf /backups/db-$(date +\%Y\%m\%d).tar.gz /app/database/
```

### Version Control
- Code: Git
- Database: S3 versioning or Git LFS
- Metadata: Include in Git

## Next Steps

1. ✅ Create `.gitignore`
2. ✅ Create `README.md`
3. ✅ Create `DEPLOYMENT.md`
4. ⏳ Push to Git
5. ⏳ Deploy backend to Railway
6. ⏳ Deploy frontend to Vercel
7. ⏳ Upload database to Railway volume

Ready to proceed with deployment?
