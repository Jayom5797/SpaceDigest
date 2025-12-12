/**
 * Parse NASA ADS bulk export files (BibTeX ABS format)
 * Usage: node scripts/ingest-nasa-ads-bulk.js <directory-with-bib-files>
 */

const fs = require('fs');
const path = require('path');

const TOPICS_DIR = path.join(__dirname, '../database/topics');

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

function parseBibTeX(content) {
  const entries = [];
  
  // Split by @ to get individual entries
  const rawEntries = content.split(/@/).filter(e => e.trim());
  
  for (const rawEntry of rawEntries) {
    // Extract bibcode (first line before comma)
    const firstComma = rawEntry.indexOf(',');
    if (firstComma === -1) continue;
    
    const firstLine = rawEntry.substring(0, firstComma);
    const bibcodeMatch = firstLine.match(/\w+\{(.+)/);
    if (!bibcodeMatch) continue;
    
    const bibcode = bibcodeMatch[1].trim();
    const fieldsText = rawEntry.substring(firstComma + 1);
    
    const entry = { bibcode };
    
    // Parse fields using line-by-line approach
    const lines = fieldsText.split('\n');
    let currentField = null;
    let currentValue = [];
    let braceCount = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '}') continue;
      
      // Check if this line starts a new field (field = {value or field = "value")
      const fieldStart = trimmed.match(/^(\w+)\s*=\s*[\{"](.*)$/);
      
      if (fieldStart && braceCount === 0) {
        // Save previous field
        if (currentField) {
          entry[currentField] = currentValue.join(' ').replace(/\s+/g, ' ').trim();
        }
        
        // Start new field
        currentField = fieldStart[1].toLowerCase();
        const restOfLine = fieldStart[2];
        
        // Check if it's a quoted string (ends with ",)
        if (restOfLine.endsWith('",')) {
          entry[currentField] = restOfLine.slice(0, -2).trim();
          currentField = null;
          currentValue = [];
          continue;
        }
        
        // Check if it's a brace value (ends with },)
        if (restOfLine.endsWith('},')) {
          entry[currentField] = restOfLine.slice(0, -2).trim();
          currentField = null;
          currentValue = [];
          continue;
        }
        
        // Otherwise it's multiline
        currentValue = [restOfLine];
        braceCount = (restOfLine.match(/\{/g) || []).length - (restOfLine.match(/\}/g) || []).length;
        
      } else if (currentField) {
        // Continue current field
        currentValue.push(trimmed);
        braceCount += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
        
        // Check if field closes
        if (braceCount <= 0 || trimmed.endsWith('},')) {
          const joined = currentValue.join(' ').replace(/\s+/g, ' ').trim();
          entry[currentField] = joined.replace(/\},?$/, '').trim();
          currentField = null;
          currentValue = [];
          braceCount = 0;
        }
      }
    }
    
    // Extract arXiv ID
    let arxivId = null;
    if (entry.eprint) {
      arxivId = entry.eprint;
    } else if (bibcode.includes('arXiv')) {
      const match = bibcode.match(/arXiv:(\d+\.\d+)/);
      if (match) arxivId = match[1];
    }
    
    // Clean up fields (remove surrounding braces/quotes and trailing garbage)
    const cleanField = (str) => {
      if (!str) return '';
      return str
        .replace(/^[\{"]/, '') // Remove leading { or "
        .replace(/[\}"]\\?"?,?$/, '') // Remove trailing }, ", \", },
        .trim();
    };
    
    const paper = {
      type: 'paper',
      title: cleanField(entry.title) || 'Untitled',
      authors: cleanField(entry.author) || 'Unknown',
      arxiv: arxivId,
      doi: entry.doi || null,
      journal: cleanField(entry.journal || entry.booktitle) || 'Unknown',
      publicationDate: entry.year || entry.month || null,
      citationCount: 0, // BibTeX doesn't include citation count
      abstract: cleanField(entry.abstract) || '',
      url: `https://ui.adsabs.harvard.edu/abs/${bibcode}`
    };
    
    entries.push(paper);
  }
  
  return entries;
}

async function ingestBulk(inputDir) {
  console.log('=== NASA ADS Bulk Ingestion ===\n');
  console.log(`Reading from: ${inputDir}\n`);
  
  const files = fs.readdirSync(inputDir)
    .filter(f => f.startsWith('export-bibtexabs') && f.endsWith('.bib'))
    .sort((a, b) => {
      const matchA = a.match(/\((\d+)\)/);
      const matchB = b.match(/\((\d+)\)/);
      const numA = matchA ? parseInt(matchA[1]) : 0;
      const numB = matchB ? parseInt(matchB[1]) : 0;
      return numA - numB;
    });
  
  if (files.length === 0) {
    console.error('ERROR: No export-bibtexabs*.bib files found');
    process.exit(1);
  }
  
  console.log(`Found ${files.length} batch files\n`);
  
  const papersByTopic = new Map();
  const seen = new Set();
  let totalPapers = 0;
  let duplicates = 0;
  
  for (const file of files) {
    const filepath = path.join(inputDir, file);
    console.log(`Processing: ${file}`);
    
    const content = fs.readFileSync(filepath, 'utf8');
    const papers = parseBibTeX(content);
    
    let batchCount = 0;
    
    for (const paper of papers) {
      // Deduplicate by URL
      if (seen.has(paper.url)) {
        duplicates++;
        continue;
      }
      seen.add(paper.url);
      
      const topic = classifyTopic(paper.title, paper.abstract);
      
      if (!papersByTopic.has(topic)) {
        papersByTopic.set(topic, []);
      }
      
      papersByTopic.get(topic).push(paper);
      totalPapers++;
      batchCount++;
    }
    
    console.log(`  Parsed: ${batchCount} papers\n`);
  }
  
  console.log(`✓ Parsing complete`);
  console.log(`  Total papers: ${totalPapers.toLocaleString()}`);
  console.log(`  Duplicates removed: ${duplicates.toLocaleString()}`);
  console.log(`  Unique papers: ${(totalPapers - duplicates).toLocaleString()}\n`);
  
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
    
    // Deduplicate against existing papers
    const existingUrls = new Set(subtopic.sources.map(p => p.url));
    const newPapers = papers.filter(p => !existingUrls.has(p.url));
    
    subtopic.sources.push(...newPapers);
    console.log(`  ${topicName}: +${newPapers.length.toLocaleString()} papers (${papers.length - newPapers.length} duplicates skipped)`);
    
    fs.writeFileSync(filepath, JSON.stringify(topicData, null, 2));
  }
  
  console.log('\n✓ Ingestion complete');
  console.log('\nNext step: Run "npm run build" to regenerate keywords');
}

const inputDir = process.argv[2];
if (!inputDir) {
  console.error('Usage: node scripts/ingest-nasa-ads-bulk.js <directory-with-bib-files>');
  process.exit(1);
}

ingestBulk(inputDir).catch(console.error);
