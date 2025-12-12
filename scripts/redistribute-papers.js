/**
 * Redistribute papers from first subtopic into appropriate subtopics
 * Uses keyword matching to classify papers into pre-defined subtopics
 * Papers that don't match go to "Other" subtopic
 * 
 * Usage: node scripts/redistribute-papers.js
 */

const fs = require('fs');
const path = require('path');

const TOPICS_DIR = path.join(__dirname, '../database/topics');

// Subtopic classification patterns for each topic
const SUBTOPIC_PATTERNS = {
  'Black Holes': {
    'Event Horizons': /event horizon|schwarzschild|kerr|singularity|no-hair|penrose/i,
    'Hawking Radiation': /hawking radiation|black hole evaporation|quantum|thermal|bekenstein/i,
    'Formation Mechanisms': /formation|primordial|stellar collapse|supermassive|intermediate mass|seed/i,
    'Accretion Disks': /accretion disk|accretion flow|quasar|agn|active galactic|torus/i,
    'Observations': /observation|detection|image|shadow|m87|sgr|lensing|gravitational lens/i
  },
  
  'Neutron Stars': {
    'Mass Limits': /tov limit|maximum mass|chandrasekhar|mass limit|upper limit/i,
    'Pulsars': /pulsar|millisecond|rotation|spin|timing|radio pulse/i,
    'Magnetic Fields': /magnetic field|magnetar|magnetosphere|magnetic flux/i,
    'Equation of State': /equation of state|eos|nuclear matter|dense matter|pressure/i,
    'Observations': /observation|detection|x-ray|binary|merger|kilonova/i
  },
  
  'Dark Matter and Dark Energy': {
    'Galactic Rotation Curves': /rotation curve|galactic rotation|velocity curve|spiral galaxy/i,
    'Cosmological Evidence': /cosmological|cmb|cosmic microwave|large scale|structure formation/i,
    'Detection Methods': /direct detection|wimp|axion|detector|xenon|lux|cdms/i,
    'Candidates': /candidate|wimp|axion|sterile neutrino|primordial|macho/i,
    'Dark Energy': /dark energy|cosmological constant|quintessence|accelerat|expansion/i
  },
  
  'Exoplanets': {
    'Detection Methods': /transit|radial velocity|detection method|doppler|astrometry|microlensing/i,
    'Atmospheric Composition': /atmosphere|atmospheric|spectroscopy|biosignature|chemical/i,
    'Habitability': /habitable zone|habitability|goldilocks|earth-like|water/i,
    'Formation': /formation|protoplanetary disk|planet formation|migration|accretion/i,
    'Observations': /observation|characterization|kepler|tess|jwst|direct imaging/i
  },
  
  'Galaxies': {
    'Formation and Evolution': /formation|evolution|early universe|high redshift|assembly|merger/i,
    'Structure': /structure|morphology|spiral|elliptical|disk|bulge|bar/i,
    'Active Galactic Nuclei': /agn|active galactic|quasar|seyfert|blazar|radio galaxy/i,
    'Galaxy Clusters': /cluster|group|virgo|coma|intracluster|cluster mass/i,
    'Observations': /observation|survey|sdss|hubble|spectroscopy|photometry/i
  },
  
  'Cosmology': {
    'Big Bang Theory': /big bang|nucleosynthesis|primordial|early universe|recombination/i,
    'Cosmic Microwave Background': /cmb|cosmic microwave|planck|wmap|temperature fluctuation/i,
    'Inflation': /inflation|inflaton|slow roll|scalar field|primordial fluctuation/i,
    'Dark Energy': /dark energy|cosmological constant|accelerat|equation of state/i,
    'Large Scale Structure': /large scale|structure formation|power spectrum|correlation|bao/i
  },
  
  'Star Formation': {
    'Molecular Clouds': /molecular cloud|giant molecular|ism|interstellar medium|cloud core/i,
    'Protostars': /protostar|class 0|class i|young stellar|yso|pre-main/i,
    'Stellar Evolution': /stellar evolution|main sequence|post-main|giant|supergiant/i,
    'Supernovae': /supernova|core collapse|type ia|type ii|explosion|remnant/i,
    'Observations': /observation|survey|infrared|submillimeter|alma|herschel/i
  },
  
  'Gravitational Waves': {
    'Detection': /detection|detector|sensitivity|noise|strain|interferometer/i,
    'Binary Mergers': /binary merger|coalescence|inspiral|ringdown|black hole merger|neutron star merger/i,
    'Waveform Analysis': /waveform|template|matched filter|parameter estimation|bayesian/i,
    'Sources': /source|population|rate|formation channel|binary evolution/i,
    'LIGO/Virgo': /ligo|virgo|kagra|gw150914|gw170817|gravitational wave observatory/i
  },
  
  'High Energy Astrophysics': {
    'X-ray Sources': /x-ray|xmm|chandra|nustar|x-ray binary|x-ray emission/i,
    'Gamma-ray Bursts': /gamma-ray burst|grb|afterglow|prompt emission|long grb|short grb/i,
    'Cosmic Rays': /cosmic ray|ultra-high energy|uhecr|particle|acceleration/i,
    'Particle Acceleration': /acceleration|shock|fermi|synchrotron|non-thermal/i,
    'Observations': /observation|spectrum|spectral|flux|luminosity|variability/i
  },
  
  'Instrumentation and Methods': {
    'Telescopes': /telescope|observatory|instrument|mirror|aperture|focal/i,
    'Detectors': /detector|ccd|cmos|sensor|pixel|readout/i,
    'Data Analysis': /data analysis|pipeline|reduction|calibration|processing/i,
    'Spectroscopy': /spectroscopy|spectrograph|spectral resolution|wavelength/i,
    'Imaging': /imaging|image|photometry|astrometry|resolution/i
  },
  
  'Planetary Science': {
    'Terrestrial Planets': /terrestrial|rocky|mercury|venus|earth|mars/i,
    'Gas Giants': /gas giant|jupiter|saturn|ice giant|uranus|neptune/i,
    'Moons': /moon|satellite|titan|europa|enceladus|ganymede/i,
    'Planetary Formation': /planetary formation|planet formation|solar nebula|accretion/i,
    'Atmospheres': /atmosphere|atmospheric|weather|climate|wind/i
  },
  
  'Small Bodies': {
    'Asteroids': /asteroid|near-earth|main belt|trojan|centaur/i,
    'Comets': /comet|nucleus|coma|tail|kuiper belt object/i,
    'Meteorites': /meteorite|chondrite|achondrite|fall|impact/i,
    'Kuiper Belt': /kuiper belt|trans-neptunian|tno|scattered disk/i,
    'Impact Events': /impact|crater|collision|chicxulub|tunguska/i
  },
  
  'Solar Physics': {
    'Solar Structure': /solar structure|interior|core|radiative zone|convection zone/i,
    'Solar Wind': /solar wind|heliosphere|parker|coronal hole/i,
    'Coronal Mass Ejections': /cme|coronal mass ejection|eruption|flare/i,
    'Solar Flares': /solar flare|flare|x-ray flare|radio burst/i,
    'Heliosphere': /heliosphere|termination shock|heliopause|interstellar/i
  },
  
  'Stellar Astrophysics': {
    'Main Sequence Stars': /main sequence|dwarf|solar-type|stellar mass|luminosity/i,
    'Stellar Evolution': /stellar evolution|giant|supergiant|asymptotic|horizontal branch/i,
    'Binary Systems': /binary|eclipsing|spectroscopic binary|contact binary/i,
    'Variable Stars': /variable|cepheid|rr lyrae|pulsating|mira/i,
    'Stellar Populations': /stellar population|metallicity|age|isochrone/i
  }
};

function classifyPaper(paper, patterns) {
  const text = `${paper.title} ${paper.abstract || ''}`.toLowerCase();
  
  const scores = {};
  for (const [subtopic, pattern] of Object.entries(patterns)) {
    const matches = text.match(pattern);
    scores[subtopic] = matches ? matches.length : 0;
  }
  
  // Find best match
  let bestSubtopic = null;
  let maxScore = 0;
  
  for (const [subtopic, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestSubtopic = subtopic;
    }
  }
  
  // If no match or score too low, return null (will go to "Other")
  return maxScore > 0 ? bestSubtopic : null;
}

async function redistributeTopic(topicName, patterns) {
  const filename = topicName.toLowerCase().replace(/\s+/g, '-') + '.json';
  const filepath = path.join(TOPICS_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`  ⚠ Topic file not found: ${filename}`);
    return;
  }
  
  const topicData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  
  // Create map of subtopics
  const subtopicMap = new Map();
  for (const subtopic of topicData.subtopics) {
    subtopicMap.set(subtopic.name, subtopic);
  }
  
  // Add "Other" subtopic if it doesn't exist
  if (!subtopicMap.has('Other')) {
    topicData.subtopics.push({
      name: 'Other',
      keywords: [],
      sources: []
    });
    subtopicMap.set('Other', topicData.subtopics[topicData.subtopics.length - 1]);
  }
  
  // Collect all papers
  const allPapers = [];
  for (const subtopic of topicData.subtopics) {
    allPapers.push(...subtopic.sources);
    subtopic.sources = []; // Clear all sources
  }
  
  console.log(`  Total papers to redistribute: ${allPapers.length}`);
  
  // Redistribute papers in batches to avoid stack overflow
  const distribution = {};
  for (const subtopicName of subtopicMap.keys()) {
    distribution[subtopicName] = 0;
  }
  
  const BATCH_SIZE = 10000;
  for (let i = 0; i < allPapers.length; i += BATCH_SIZE) {
    const batch = allPapers.slice(i, i + BATCH_SIZE);
    
    for (const paper of batch) {
      const targetSubtopic = classifyPaper(paper, patterns);
      const subtopicName = targetSubtopic || 'Other';
      
      const subtopic = subtopicMap.get(subtopicName);
      if (subtopic) {
        subtopic.sources.push(paper);
        distribution[subtopicName]++;
      }
    }
    
    // Progress indicator for large topics
    if (allPapers.length > 50000 && i % 50000 === 0) {
      console.log(`    Processed ${i.toLocaleString()} / ${allPapers.length.toLocaleString()} papers...`);
    }
  }
  
  // Remove empty subtopics (except "Other")
  topicData.subtopics = topicData.subtopics.filter(s => 
    s.sources.length > 0 || s.name === 'Other'
  );
  
  // Save with streaming for large files
  if (allPapers.length > 100000) {
    console.log('  Writing large file with streaming...');
    const stream = fs.createWriteStream(filepath);
    stream.write('{\n  "topic": ' + JSON.stringify(topicData.topic) + ',\n');
    stream.write('  "subtopics": [\n');
    
    for (let i = 0; i < topicData.subtopics.length; i++) {
      const subtopic = topicData.subtopics[i];
      stream.write('    {\n');
      stream.write('      "name": ' + JSON.stringify(subtopic.name) + ',\n');
      stream.write('      "keywords": ' + JSON.stringify(subtopic.keywords) + ',\n');
      stream.write('      "sources": [\n');
      
      for (let j = 0; j < subtopic.sources.length; j++) {
        const source = subtopic.sources[j];
        stream.write('        ' + JSON.stringify(source));
        if (j < subtopic.sources.length - 1) stream.write(',');
        stream.write('\n');
      }
      
      stream.write('      ]\n');
      stream.write('    }');
      if (i < topicData.subtopics.length - 1) stream.write(',');
      stream.write('\n');
    }
    
    stream.write('  ]\n');
    stream.write('}\n');
    stream.end();
    
    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  } else {
    fs.writeFileSync(filepath, JSON.stringify(topicData, null, 2));
  }
  
  // Print distribution
  console.log('  Distribution:');
  for (const [subtopic, count] of Object.entries(distribution)) {
    if (count > 0) {
      const percentage = ((count / allPapers.length) * 100).toFixed(1);
      console.log(`    ${subtopic}: ${count.toLocaleString()} (${percentage}%)`);
    }
  }
}

async function redistribute() {
  console.log('=== Redistributing Papers to Subtopics ===\n');
  
  let totalTopics = 0;
  let totalPapers = 0;
  
  for (const [topicName, patterns] of Object.entries(SUBTOPIC_PATTERNS)) {
    console.log(`Processing: ${topicName}`);
    await redistributeTopic(topicName, patterns);
    console.log('');
    totalTopics++;
  }
  
  console.log('✓ Redistribution complete');
  console.log(`  Topics processed: ${totalTopics}`);
  console.log('\nNext step: Run "npm run build" to regenerate keywords');
}

redistribute().catch(console.error);
