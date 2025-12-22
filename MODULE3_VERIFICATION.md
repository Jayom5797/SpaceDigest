# Module 3: AI-Powered Claim Verification (Ollama)

## Overview

Module 3 adds intelligent claim verification using **Ollama** - a local AI model runner. No API keys, no rate limits, completely free.

---

## Setup

### 1. Install Ollama

**Windows:**
1. Download from https://ollama.com/download
2. Run installer
3. Ollama runs as a service on `http://localhost:11434`

**Linux/Mac:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Download AI Model

```bash
# Fast, good quality (recommended)
ollama pull llama3.2

# Alternative: Smaller, faster
ollama pull llama3.2:1b

# Alternative: Larger, better quality
ollama pull llama3.1:8b
```

### 3. Verify Ollama is Running

```bash
curl http://localhost:11434/api/tags
```

Should return list of installed models.

### 4. Install Dependencies

```bash
npm install
```

---

## Configuration

### Local Development

No configuration needed! Ollama runs on `http://localhost:11434` by default.

### Production (Railway)

**Option 1: External Ollama Server**
Set environment variable:
```
OLLAMA_HOST=http://your-ollama-server:11434
```

**Option 2: Run Ollama on Railway**
Not recommended - Railway doesn't support GPU, verification will be VERY slow.

**Option 3: Disable Verification in Production**
Keep verification local-only for development/testing.

---

## How It Works

1. **User submits claim**: "Black holes emit gravitational waves"
2. **System finds papers**: Uses existing search (Module 2)
3. **AI analyzes papers**: Ollama (llama3.2) reads abstracts and determines support/contradict/neutral
4. **Generates summary**: Creates verification score (0-100%) with justification

**Processing time**: 
- With GPU: 10-15 seconds for 10 papers
- Without GPU (CPU only): 30-60 seconds for 10 papers

---

## API Usage

### Endpoint

```
POST /api/verify-claim
Content-Type: application/json
```

### Request Body

```json
{
  "claim": "Black holes emit gravitational waves",
  "papers": [
    {
      "id": "2012.09864",
      "title": "Paper title",
      "abstract": "Abstract text...",
      "authors": ["Author 1"],
      "year": 2020,
      "relevance": 8.5
    }
  ],
  "maxPapers": 10
}
```

### Response

```json
{
  "claim": "Black holes emit gravitational waves",
  "verificationScore": 85,
  "verdict": "Strongly Supported",
  "confidence": "High",
  "summary": "The claim is strongly supported by recent observational evidence...",
  "keyFindings": [
    "Direct detection of gravitational waves from black hole mergers (LIGO 2016)",
    "Multiple confirmed events with high statistical significance",
    "Observations match general relativity predictions"
  ],
  "limitations": "Analysis based on abstracts only. Full paper content not analyzed.",
  "papersAnalyzed": 10,
  "papersTotal": 50,
  "analyses": [...],
  "processingTimeMs": 12543,
  "timestamp": "2025-12-18T18:00:00.000Z"
}
```

---

## Frontend Integration

Same as before - frontend code doesn't change. Just call `/api/verify-claim` endpoint.

---

## Performance

### With GPU (NVIDIA/AMD)
- **Papers analyzed**: 10
- **Processing time**: 10-15 seconds
- **Batch size**: 3 papers at a time
- **Cost**: FREE (runs locally)

### Without GPU (CPU only)
- **Papers analyzed**: 10
- **Processing time**: 30-60 seconds
- **Batch size**: 3 papers at a time
- **Cost**: FREE (runs locally)

---

## Model Comparison

| Model | Size | Speed | Quality | RAM Required |
|-------|------|-------|---------|--------------|
| llama3.2:1b | 1.3GB | Very Fast | Good | 2GB |
| llama3.2 (3b) | 2GB | Fast | Very Good | 4GB |
| llama3.1:8b | 4.7GB | Medium | Excellent | 8GB |
| llama3.1:70b | 40GB | Slow | Best | 64GB |

**Recommended: llama3.2 (3B)** - Best balance of speed and quality.

---

## Advantages Over Cloud APIs

✅ **FREE** - No API costs, no quotas
✅ **PRIVATE** - Data never leaves your machine
✅ **OFFLINE** - Works without internet
✅ **NO RATE LIMITS** - Process as many claims as you want
✅ **CUSTOMIZABLE** - Can fine-tune models for your domain

❌ **Slower** - 2-4x slower than cloud APIs (without GPU)
❌ **Requires Setup** - Must install Ollama and download models
❌ **Resource Intensive** - Uses CPU/GPU and RAM

---

## Testing

```bash
# 1. Ensure Ollama is running
ollama list

# 2. Start backend
npm start

# 3. Open frontend
# Navigate to http://localhost:3000/search.html

# 4. Search for papers
# Enter: "Neutron stars can exceed 5 solar masses"

# 5. Click "Verify Claim with AI"
# Wait 10-60 seconds for results
```

---

## Troubleshooting

### Error: "connect ECONNREFUSED localhost:11434"
**Solution:** Ollama is not running. Start it:
```bash
# Windows: Ollama runs as service automatically
# Linux/Mac:
ollama serve
```

### Error: "model 'llama3.2' not found"
**Solution:** Download the model:
```bash
ollama pull llama3.2
```

### Verification is very slow (>60 seconds)
**Solutions:**
1. Use smaller model: `ollama pull llama3.2:1b`
2. Reduce `maxPapers` from 10 to 5
3. Get a GPU (10x faster)

### Out of memory errors
**Solutions:**
1. Use smaller model: `llama3.2:1b` (1.3GB)
2. Close other applications
3. Reduce batch size in code (change `batchSize: 3` to `batchSize: 1`)

---

## Deployment Options

### Option 1: Local Only (Recommended)
- Run Ollama on your development machine
- Use for testing and personal use
- Frontend deployed to Vercel, backend to Railway
- Verification only works when connected to local machine

### Option 2: Dedicated Ollama Server
- Run Ollama on a separate server with GPU
- Set `OLLAMA_HOST` environment variable
- All users can access verification
- Requires maintaining a server

### Option 3: Disable in Production
- Keep verification as development-only feature
- Remove "Verify Claim" button in production build
- Users only get search functionality

---

## Cost Analysis

**Ollama (Local)**:
- Setup time: 10 minutes
- Cost: $0/month
- Speed: 10-60 seconds per claim
- Limit: Unlimited

**vs Google Gemini (Cloud)**:
- Setup time: 2 minutes
- Cost: $0-$7/month (free tier: 1500 requests/day)
- Speed: 6-9 seconds per claim
- Limit: 1500 requests/day (free), then $0.00025/request

**vs OpenAI GPT-4 (Cloud)**:
- Setup time: 2 minutes
- Cost: $0.03 per claim (expensive!)
- Speed: 5-8 seconds per claim
- Limit: Pay per use

**Winner: Ollama** - Free, unlimited, private. Only downside is slower speed.

---

## Next Steps

1. Install Ollama: https://ollama.com/download
2. Download model: `ollama pull llama3.2`
3. Test locally: `npm start`
4. Deploy backend to Railway (optional)
5. Configure `OLLAMA_HOST` if using external server

---

## Support

- Ollama Docs: https://ollama.com/docs
- Model Library: https://ollama.com/library
- Issues: https://github.com/Jayom5797/SpaceDigest/issues
