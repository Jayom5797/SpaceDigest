const { Ollama } = require('ollama');

class ClaimVerifier {
  constructor(ollamaHost = 'http://localhost:11434') {
    this.ollama = new Ollama({ host: ollamaHost });
    this.model = 'llama3.2'; // Using 3B model (only one installed)
    this.cache = new Map();
  }

  /**
   * Analyze a single paper's support for a claim
   */
  async analyzePaper(paper, claim) {
    const paperId = paper.id || paper.paperId || 'unknown';
    const cacheKey = `${paperId}-${claim}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const authorsStr = Array.isArray(paper.authors) 
      ? paper.authors.join(', ') 
      : (paper.authors || 'Unknown');

    const prompt = `Analyze if this paper supports or contradicts the claim.

CLAIM: "${claim}"
PAPER: ${paper.title}
ABSTRACT: ${paper.abstract.substring(0, 500)}

Respond with ONLY this JSON (no extra text):
{"stance":"supports","confidence":80,"evidence":"quote","reasoning":"why"}

stance: supports/contradicts/neutral/insufficient
confidence: 0-100`;

    try {
      const response = await this.ollama.generate({
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 150 // Shorter responses = more reliable JSON
        }
      });
      
      let text = response.response.trim();
      
      // Remove markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`Raw response for ${paperId}:`, text.substring(0, 200));
        throw new Error('Invalid JSON response from LLM');
      }
      
      const analysis = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!analysis.stance || typeof analysis.confidence !== 'number') {
        throw new Error('Missing required fields in JSON response');
      }
      
      // Add paper metadata
      analysis.paperId = paperId;
      analysis.paperTitle = paper.title;
      analysis.paperYear = paper.year;
      analysis.relevanceScore = paper.relevance || 0;
      
      this.cache.set(cacheKey, analysis);
      
      return analysis;
    } catch (error) {
      console.error(`Error analyzing paper ${paperId}:`, error.message);
      return {
        paperId: paperId,
        paperTitle: paper.title,
        stance: 'error',
        confidence: 0,
        evidence: '',
        reasoning: `Analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Analyze multiple papers in parallel (batched)
   */
  async analyzePapersBatch(papers, claim, batchSize = 3) {
    const results = [];
    
    // Ollama is local, so smaller batches to avoid overwhelming CPU
    for (let i = 0; i < papers.length; i += batchSize) {
      const batch = papers.slice(i, i + batchSize);
      const batchPromises = batch.map(paper => this.analyzePaper(paper, claim));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < papers.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }

  /**
   * Generate final verification summary
   */
  async generateSummary(claim, analyses) {
    const supporting = analyses.filter(a => a.stance === 'supports');
    const contradicting = analyses.filter(a => a.stance === 'contradicts');
    const neutral = analyses.filter(a => a.stance === 'neutral');
    const insufficient = analyses.filter(a => a.stance === 'insufficient');

    const prompt = `You are a scientific claim verification expert. Based on the analysis of ${analyses.length} papers, provide a final verification summary.

CLAIM: "${claim}"

ANALYSIS RESULTS:
- ${supporting.length} papers SUPPORT the claim
- ${contradicting.length} papers CONTRADICT the claim
- ${neutral.length} papers are NEUTRAL
- ${insufficient.length} papers have insufficient information

SUPPORTING EVIDENCE:
${supporting.slice(0, 3).map(a => `- ${a.paperTitle} (${a.paperYear}): ${a.evidence}`).join('\n')}

CONTRADICTING EVIDENCE:
${contradicting.slice(0, 3).map(a => `- ${a.paperTitle} (${a.paperYear}): ${a.evidence}`).join('\n')}

CRITICAL: Respond with ONLY a JSON object, nothing else:
{
  "verificationScore": 75,
  "verdict": "Supported",
  "confidence": "High",
  "summary": "2-3 sentence summary",
  "keyFindings": ["finding 1", "finding 2", "finding 3"],
  "limitations": "Brief note on limitations"
}

Valid verdicts: "Strongly Supported", "Supported", "Inconclusive", "Contradicted", "Strongly Contradicted"
Valid confidence: "High", "Medium", "Low"

JSON response:`;

    try {
      const response = await this.ollama.generate({
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 500
        }
      });
      
      let text = response.response.trim();
      
      // Remove markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('Summary generation failed - invalid JSON');
        throw new Error('Invalid JSON response from LLM');
      }
      
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error generating summary:', error.message);
      
      // Fallback: Calculate simple score
      const totalConfident = supporting.length + contradicting.length;
      const score = totalConfident > 0 
        ? Math.round((supporting.length / totalConfident) * 100)
        : 50;
      
      return {
        verificationScore: score,
        verdict: score > 70 ? 'Supported' : score < 30 ? 'Contradicted' : 'Inconclusive',
        confidence: 'Low',
        summary: `Based on ${analyses.length} papers: ${supporting.length} support, ${contradicting.length} contradict the claim.`,
        keyFindings: ['Analysis completed with limited LLM access'],
        limitations: 'Summary generation failed, showing basic statistics only'
      };
    }
  }

  /**
   * Main verification function
   */
  async verifyClaim(claim, papers, options = {}) {
    const {
      maxPapers = 5, // Reduced from 10 to 5
      batchSize = 3,
      onProgress = null
    } = options;

    const startTime = Date.now();

    // Step 1: Select top papers by relevance
    const topPapers = papers
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, maxPapers);

    if (onProgress) onProgress({ stage: 'analyzing', current: 0, total: topPapers.length });

    // Step 2: Analyze papers in parallel batches
    const analyses = await this.analyzePapersBatch(topPapers, claim, batchSize);

    if (onProgress) onProgress({ stage: 'summarizing', current: topPapers.length, total: topPapers.length });

    // Step 3: Generate summary
    const summary = await this.generateSummary(claim, analyses);

    const processingTime = Date.now() - startTime;

    return {
      claim,
      verificationScore: summary.verificationScore,
      verdict: summary.verdict,
      confidence: summary.confidence,
      summary: summary.summary,
      keyFindings: summary.keyFindings,
      limitations: summary.limitations,
      papersAnalyzed: analyses.length,
      papersTotal: papers.length,
      analyses: analyses.filter(a => a.stance !== 'error'),
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ClaimVerifier;
