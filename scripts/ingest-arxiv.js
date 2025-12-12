/**
 * Ingest arXiv bulk data directly into topic files
 * Usage: node scripts/ingest-arxiv.js <path-to-arxiv-snapshot.json>
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TOPICS_DIR = path.join(__dirname, '../database/topics');

// Topic classification patterns
const TOPIC_PATTERNS = {
  'Black Holes': /black hole|event horizon|hawking|schwarzschild|kerr|accretion disk/i,
  'Neutron Stars': /neutron star|pulsar|magnetar|tov limit/i,
  'Dark Matter and Dark Energy': /dark matter|dark energy|wimp|axion|cosmological constant|quintessence/i,
  'Exoplanets': /exoplanet|transit|radial velocity|habitable zone|protoplanetary/i,
  'Galaxies': /galaxy|galactic|spiral|elliptical|agn|active galactic/i,
  'Cosmology': /cosmology|cmb|cosmic microwave|inflation|big bang|hubble/i,
  'Star Formation': /star formation|molecular cloud|protostar|stellar evolution|supernova/i,
  'Gravitational Waves': /gravitational wave|ligo|virgo|binary merger|gw\d+/i,
  'Solar Physics': /solar|sun|coronal|heliosphere|solar wind|solar flare/i,
  'Planetary Science': /planet|planetary|mars|venus|jupiter|saturn/i,
  'Small Bodies': /asteroid|comet|meteorite|kuiper belt|impact/i,
  'Stellar Astrophysics': /stellar|main sequence|binary star|variable star|stellar population/i,
  'High Energy Astrophysics': /x-ray|gamma-ray|grb|cosmic ray|particle acceleration/i,
  'Instrumentation and Methods': /telescope|detector|spectroscopy|imaging|data analysis|instrument/i
};

const SUBTOPIC_PATTERNS = {
  'Mass Limits': /mass limit|tov|maximum mass|chandrasekhar/i,
  'Pulsars': /pulsar|millisecond|rotation period/i,
  'Magnetic Fields': /magnetic field|magnetar|b-field/i,
  'Equation of State': /equation of state|eos|nuclear matter/i,
  'Event Horizons': /event horizon|schwarzschild|photon sphere/i,
  'Hawking Radiation': /hawking radiation|black hole thermodynamics|bekenstein/i,
  'Formation Mechanisms': /stellar collapse|supermassive formation|primordial black/i,
  'Accretion Disks': /accretion disk|accretion flow|disk model/i,
  'Detection Methods': /direct detection|indirect detection|transit|radial velocity/i,
  'Atmospheric Composition': /atmosphere|spectroscopy|biosignature/i,
  'Habitability': /habitable|goldilocks|life/i,
  'Formation': /planet formation|protoplanetary disk|star formation/i,
  'Binary Mergers': /binary merger|coalescence|inspiral/i,
  'Detection': /detection|ligo|virgo|sensitivity/i,
  'Observations': /observation|survey|data|measurement/i
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

function classifySubtopic(title, abstract, topicName) {
  const text = `${title} ${abstract || ''}`;
  
  for (const [subtopic, pattern] of Object.entries(SUBTOPIC_PATTERNS)) {
    if (pattern.test(text)) {
      return subtopic;
    }
  }
  
  // Default subtopics by topic
  const defaults = {
    'Black Holes': 'Event Horizons',
    'Neutron Stars': 'Mass Limits',
    'Exoplanets': 'Detection Methods',
    'Gravitational Waves': 'Detection'
  };
  
  return defaults[topicName] || 'Observations';
}

function isSpaceScience(categories) {
  if (!categories) return false;
  const spaceCategories = ['astro-ph', 'gr-qc', 'hep-ph', 'hep-th'];
  return spaceCategories.some(cat => categories.includes(cat));
}

async function ingestArxiv(inputPath) {
  console.log('=== arXiv Bulk Ingestion ===\n');
  console.log(`Reading: ${inputPath}\n`);
  
  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: File not found: ${inputPath}`);
    process.exit(1);
  }
  
  const fileStream = fs.createReadStream(inputPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  const papersByTopic = new Map();
  let processed = 0;
  let spaceScienceCount = 0;
  
  for await (const line of rl) {
    if (!line.trim() || line.trim() === '[' || line.trim() === ']') continue;
    
    try {
      const paperStr = line.replace(/,$/, '');
      const paper = JSON.parse(paperStr);
      processed++;
      
      if (!isSpaceScience(paper.categories)) continue;
      
      spaceScienceCount++;
      const topic = classifyTopic(paper.title, paper.abstract);
      const subtopic = classifySubtopic(paper.title, paper.abstract, topic);
      
      if (!papersByTopic.has(topic)) {
        papersByTopic.set(topic, new Map());
      }
      if (!papersByTopic.get(topic).has(subtopic)) {
        papersByTopic.get(topic).set(subtopic, []);
      }
      
      papersByTopic.get(topic).get(subtopic).push({
        type: 'paper',
        title: paper.title,
        authors: paper.authors_parsed?.map(a => a.join(' ')).join(', ') || paper.authors,
        arxiv: paper.id,
        doi: paper.doi || null,
        journal: paper.journal_ref || 'arXiv preprint',
        publicationDate: paper.update_date || paper.versions?.[0]?.created,
        citationCount: 0,
        abstract: paper.abstract,
        url: `https://arxiv.org/abs/${paper.id}`
      });
      
      if (processed % 10000 === 0) {
        console.log(`  Processed: ${processed.toLocaleString()} | Space science: ${spaceScienceCount.toLocaleString()}`);
      }
    } catch (e) {
      // Skip malformed lines
    }
  }
  
  console.log(`\n✓ Parsing complete`);
  console.log(`  Total entries: ${processed.toLocaleString()}`);
  console.log(`  Space science: ${spaceScienceCount.toLocaleString()}`);
  console.log(`  Skipped: ${(processed - spaceScienceCount).toLocaleString()}\n`);
  
  // Save to topic files
  console.log('Saving to topic files...\n');
  
  for (const [topicName, subtopics] of papersByTopic) {
    const filename = topicName.toLowerCase().replace(/\s+/g, '-') + '.json';
    const filepath = path.join(TOPICS_DIR, filename);
    
    let topicData = { topic: topicName, subtopics: [] };
    
    // Load existing if present
    if (fs.existsSync(filepath)) {
      topicData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
    
    // Merge papers into subtopics
    for (const [subtopicName, papers] of subtopics) {
      let subtopicData = topicData.subtopics.find(s => s.name === subtopicName);
      
      if (!subtopicData) {
        subtopicData = { name: subtopicName, keywords: [], sources: [] };
        topicData.subtopics.push(subtopicData);
      }
      
      subtopicData.sources.push(...papers);
      console.log(`  ${topicName} → ${subtopicName}: +${papers.length} papers`);
    }
    
    fs.writeFileSync(filepath, JSON.stringify(topicData, null, 2));
  }
  
  console.log('\n✓ Ingestion complete');
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/ingest-arxiv.js <path-to-arxiv-snapshot.json>');
  process.exit(1);
}

ingestArxiv(inputPath).catch(console.error);
