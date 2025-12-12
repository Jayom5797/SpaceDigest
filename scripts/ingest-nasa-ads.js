/**
 * Fetch papers from NASA ADS API and save directly to topic files
 * Usage: node scripts/ingest-nasa-ads.js <api-key> [max-requests]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TOPICS_DIR = path.join(__dirname, '../database/topics');
const API_BASE = 'https://api.adsabs.harvard.edu/v1/search/query';

// Topic classification (same as arXiv)
const TOPIC_PATTERNS = {
  'Black Holes': /black hole|event horizon|hawking|schwarzschild|kerr|accretion disk/i,
  'Neutron Stars': /neutron star|pulsar|magnetar|tov limit/i,
  'Dark Matter and Dark Energy': /dark matter|dark energy|wimp|axion|cosmological constant/i,
  'Exoplanets': /exoplanet|transit|radial velocity|habitable zone/i,
  'Galaxies': /galaxy|galactic|spiral|elliptical|agn/i,
  'Cosmology': /cosmology|cmb|cosmic microwave|inflation|big bang/i,
  'Star Formation': /star formation|molecular cloud|protostar|supernova/i,
  'Gravitational Waves': /gravitational wave|ligo|virgo|binary merger/i,
  'Solar Physics': /solar|sun|coronal|heliosphere/i,
  'Planetary Science': /planet|planetary|mars|venus|jupiter/i,
  'Small Bodies': /asteroid|comet|meteorite|kuiper belt/i,
  'Stellar Astrophysics': /stellar|main sequence|binary star/i,
  'High Energy Astrophysics': /x-ray|gamma-ray|grb|cosmic ray/i,
  'Instrumentation and Methods': /telescope|detector|spectroscopy|imaging/i
};

function classifyTopic(title, abstract) {
  const text = `${title} ${abstract || ''}`;
  let bestTopic = null;
  let maxScore = 0;
  
  for (const [topic, pattern] of Object.entries(TOPIC_PATTERNS)) {
    const matches = text.match(pattern);
    const score = matches ? matches.length : 0;
    if (score > maxScore) {
      maxScore = score;
      bestTopic = topic;
    }
  }
  
  return bestTopic || 'Instrumentation and Methods';
}

function fetchADS(query, apiKey, start = 0) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      q: query,
      fl: 'title,author,bibcode,doi,pub,pubdate,citation_count,abstract,identifier',
      rows: 100,
      start: start
    });
    
    const options = {
      hostname: 'api.adsabs.harvard.edu',
      path: `/v1/search/query?${params}`,
      headers: { 'Authorization': `Bearer ${apiKey}` }
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else if (res.statusCode === 429) {
          reject(new Error('RATE_LIMIT'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function ingestNASAADS(apiKey, maxRequests = 5000) {
  console.log('=== NASA ADS Ingestion ===\n');
  console.log(`Max requests: ${maxRequests}\n`);
  
  const queries = [
    'black holes', 'neutron stars', 'dark matter', 'exoplanets',
    'galaxies', 'cosmology', 'gravitational waves', 'stellar evolution',
    'supernovae', 'pulsars', 'active galactic nuclei', 'cosmic microwave background'
  ];
  
  const papersByTopic = new Map();
  let totalPapers = 0;
  let requestCount = 0;
  
  for (const query of queries) {
    if (requestCount >= maxRequests) break;
    
    console.log(`\nFetching: "${query}"`);
    let start = 0;
    let hasMore = true;
    
    while (hasMore && requestCount < maxRequests) {
      try {
        const result = await fetchADS(query, apiKey, start);
        requestCount++;
        
        const papers = result.response?.docs || [];
        if (papers.length === 0) break;
        
        for (const paper of papers) {
          const topic = classifyTopic(paper.title?.[0] || '', paper.abstract || '');
          
          if (!papersByTopic.has(topic)) {
            papersByTopic.set(topic, []);
          }
          
          papersByTopic.get(topic).push({
            type: 'paper',
            title: paper.title?.[0] || 'Untitled',
            authors: paper.author?.join(', ') || 'Unknown',
            arxiv: paper.identifier?.find(id => id.includes('arXiv'))?.replace('arXiv:', '') || null,
            doi: paper.doi?.[0] || null,
            journal: paper.pub || 'Unknown',
            publicationDate: paper.pubdate || null,
            citationCount: paper.citation_count || 0,
            abstract: paper.abstract || '',
            url: `https://ui.adsabs.harvard.edu/abs/${paper.bibcode}`
          });
          
          totalPapers++;
        }
        
        console.log(`  Fetched: ${papers.length} papers (total: ${totalPapers}, requests: ${requestCount})`);
        
        start += 100;
        hasMore = papers.length === 100;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err) {
        if (err.message === 'RATE_LIMIT') {
          console.log('  Rate limited, waiting 60s...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        } else {
          console.error(`  Error: ${err.message}`);
          break;
        }
      }
    }
  }
  
  console.log(`\n✓ Fetching complete`);
  console.log(`  Total papers: ${totalPapers.toLocaleString()}`);
  console.log(`  API requests: ${requestCount}\n`);
  
  // Save to topic files
  console.log('Saving to topic files...\n');
  
  for (const [topicName, papers] of papersByTopic) {
    const filename = topicName.toLowerCase().replace(/\s+/g, '-') + '.json';
    const filepath = path.join(TOPICS_DIR, filename);
    
    let topicData = { topic: topicName, subtopics: [] };
    
    if (fs.existsSync(filepath)) {
      topicData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
    
    // Add to first subtopic (or create Observations)
    let subtopic = topicData.subtopics[0];
    if (!subtopic) {
      subtopic = { name: 'Observations', keywords: [], sources: [] };
      topicData.subtopics.push(subtopic);
    }
    
    subtopic.sources.push(...papers);
    console.log(`  ${topicName}: +${papers.length} papers`);
    
    fs.writeFileSync(filepath, JSON.stringify(topicData, null, 2));
  }
  
  console.log('\n✓ Ingestion complete');
}

const apiKey = process.argv[2];
const maxRequests = parseInt(process.argv[3]) || 5000;

if (!apiKey) {
  console.error('Usage: node scripts/ingest-nasa-ads.js <api-key> [max-requests]');
  process.exit(1);
}

ingestNASAADS(apiKey, maxRequests).catch(console.error);
