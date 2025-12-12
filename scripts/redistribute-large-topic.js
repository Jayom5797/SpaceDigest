/**
 * Redistribute papers for a single large topic using streaming
 * Usage: node --max-old-space-size=8192 scripts/redistribute-large-topic.js <topic-name>
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TOPICS_DIR = path.join(__dirname, '../database/topics');

const SUBTOPIC_PATTERNS = {
  'Galaxies': {
    'Formation and Evolution': /formation|evolution|early universe|high redshift|assembly|merger/i,
    'Structure': /structure|morphology|spiral|elliptical|disk|bulge|bar/i,
    'Active Galactic Nuclei': /agn|active galactic|quasar|seyfert|blazar|radio galaxy/i,
    'Galaxy Clusters': /cluster|group|virgo|coma|intracluster|cluster mass/i,
    'Observations': /observation|survey|sdss|hubble|spectroscopy|photometry/i
  }
};

function classifyPaper(paper, patterns) {
  const text = `${paper.title} ${paper.abstract || ''}`.toLowerCase();
  
  const scores = {};
  for (const [subtopic, pattern] of Object.entries(patterns)) {
    const matches = text.match(pattern);
    scores[subtopic] = matches ? matches.length : 0;
  }
  
  let bestSubtopic = null;
  let maxScore = 0;
  
  for (const [subtopic, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestSubtopic = subtopic;
    }
  }
  
  return maxScore > 0 ? bestSubtopic : null;
}

async function redistributeLargeTopic(topicName) {
  console.log(`=== Redistributing Large Topic: ${topicName} ===\n`);
  
  const patterns = SUBTOPIC_PATTERNS[topicName];
  if (!patterns) {
    console.error(`No patterns defined for topic: ${topicName}`);
    process.exit(1);
  }
  
  const filename = topicName.toLowerCase().replace(/\s+/g, '-') + '.json';
  const filepath = path.join(TOPICS_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    console.error(`Topic file not found: ${filepath}`);
    process.exit(1);
  }
  
  console.log('Reading and parsing topic file (this may take a while)...');
  
  // Read file in chunks to avoid stack overflow
  const content = fs.readFileSync(filepath, 'utf8');
  console.log(`File size: ${(content.length / (1024 * 1024)).toFixed(1)}MB`);
  
  // Parse JSON manually to avoid stack overflow
  console.log('Parsing JSON...');
  let topicData;
  try {
    topicData = JSON.parse(content);
  } catch (err) {
    console.error('Failed to parse JSON:', err.message);
    process.exit(1);
  }
  
  // Collect all papers
  const allPapers = [];
  for (const subtopic of topicData.subtopics) {
    allPapers.push(...subtopic.sources);
  }
  
  console.log(`Total papers: ${allPapers.toLocaleString()}\n`);
  
  // Create new subtopics
  const subtopics = {};
  for (const subtopicName of Object.keys(patterns)) {
    subtopics[subtopicName] = [];
  }
  subtopics['Other'] = [];
  
  // Redistribute in batches
  const BATCH_SIZE = 5000;
  for (let i = 0; i < allPapers.length; i += BATCH_SIZE) {
    const batch = allPapers.slice(i, i + BATCH_SIZE);
    
    for (const paper of batch) {
      const targetSubtopic = classifyPaper(paper, patterns);
      const subtopicName = targetSubtopic || 'Other';
      subtopics[subtopicName].push(paper);
    }
    
    if (i % 50000 === 0) {
      console.log(`Processed ${i.toLocaleString()} / ${allPapers.length.toLocaleString()} papers...`);
    }
  }
  
  console.log(`\nDistribution:`);
  for (const [name, papers] of Object.entries(subtopics)) {
    const percentage = ((papers.length / allPapers.length) * 100).toFixed(1);
    console.log(`  ${name}: ${papers.length.toLocaleString()} (${percentage}%)`);
  }
  
  // Build new topic structure
  const newTopicData = {
    topic: topicName,
    subtopics: []
  };
  
  for (const [name, papers] of Object.entries(subtopics)) {
    if (papers.length > 0 || name === 'Other') {
      newTopicData.subtopics.push({
        name: name,
        keywords: [],
        sources: papers
      });
    }
  }
  
  // Write with streaming
  console.log('\nWriting redistributed data...');
  const stream = fs.createWriteStream(filepath);
  stream.write('{\n  "topic": ' + JSON.stringify(newTopicData.topic) + ',\n');
  stream.write('  "subtopics": [\n');
  
  for (let i = 0; i < newTopicData.subtopics.length; i++) {
    const subtopic = newTopicData.subtopics[i];
    stream.write('    {\n');
    stream.write('      "name": ' + JSON.stringify(subtopic.name) + ',\n');
    stream.write('      "keywords": [],\n');
    stream.write('      "sources": [\n');
    
    for (let j = 0; j < subtopic.sources.length; j++) {
      const source = subtopic.sources[j];
      stream.write('        ' + JSON.stringify(source));
      if (j < subtopic.sources.length - 1) stream.write(',');
      stream.write('\n');
      
      if (j % 10000 === 0 && j > 0) {
        console.log(`  Written ${j.toLocaleString()} / ${subtopic.sources.length.toLocaleString()} papers for ${subtopic.name}...`);
      }
    }
    
    stream.write('      ]\n');
    stream.write('    }');
    if (i < newTopicData.subtopics.length - 1) stream.write(',');
    stream.write('\n');
  }
  
  stream.write('  ]\n');
  stream.write('}\n');
  stream.end();
  
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  
  console.log('\n✓ Redistribution complete');
}

const topicName = process.argv[2];
if (!topicName) {
  console.error('Usage: node scripts/redistribute-large-topic.js <topic-name>');
  console.error('Example: node scripts/redistribute-large-topic.js Galaxies');
  process.exit(1);
}

redistributeLargeTopic(topicName).catch(console.error);
