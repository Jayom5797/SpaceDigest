/**
 * Redistribute papers between subtopic files based on keyword matching
 * Works with new per-subtopic file structure
 * 
 * Usage: node --max-old-space-size=4096 scripts/redistribute-subtopics.js
 */

const fs = require('fs');
const path = require('path');

const TOPICS_DIR = path.join(__dirname, '../database/topics');

// Same patterns as before
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

async function redistributeTopic(topicName, topicDir, patterns) {
  console.log(`\nProcessing: ${topicName}`);
  
  // Load all subtopic files
  const subtopicFiles = fs.readdirSync(topicDir)
    .filter(f => f.endsWith('.json') && f !== '_topic.json');
  
  // Collect all papers (with memory-safe loading for large topics)
  const allPapers = [];
  let totalPapers = 0;
  
  for (const file of subtopicFiles) {
    const filepath = path.join(topicDir, file);
    const stats = fs.statSync(filepath);
    const sizeMB = stats.size / (1024 * 1024);
    
    // For very large files (>100MB), process separately
    if (sizeMB > 100) {
      console.log(`  ⚠ Large subtopic file: ${file} (${sizeMB.toFixed(1)}MB) - processing separately`);
      const content = fs.readFileSync(filepath, 'utf8');
      const data = JSON.parse(content);
      totalPapers += data.sources.length;
      
      // Process in batches to avoid stack overflow
      const BATCH_SIZE = 10000;
      for (let i = 0; i < data.sources.length; i += BATCH_SIZE) {
        const batch = data.sources.slice(i, i + BATCH_SIZE);
        allPapers.push(...batch);
      }
    } else {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      allPapers.push(...data.sources);
      totalPapers += data.sources.length;
    }
  }
  
  console.log(`  Total papers: ${totalPapers.toLocaleString()}`);
  
  // Redistribute papers
  const newSubtopics = {};
  for (const subtopicName of Object.keys(patterns)) {
    newSubtopics[subtopicName] = [];
  }
  newSubtopics['Other'] = [];
  
  for (const paper of allPapers) {
    const targetSubtopic = classifyPaper(paper, patterns);
    const subtopicName = targetSubtopic || 'Other';
    newSubtopics[subtopicName].push(paper);
  }
  
  // Print distribution
  console.log('  Distribution:');
  for (const [name, papers] of Object.entries(newSubtopics)) {
    if (papers.length > 0) {
      const percentage = ((papers.length / allPapers.length) * 100).toFixed(1);
      console.log(`    ${name}: ${papers.length.toLocaleString()} (${percentage}%)`);
    }
  }
  
  // Save to subtopic files
  for (const [subtopicName, papers] of Object.entries(newSubtopics)) {
    const filename = subtopicName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/\//g, '-')
      .replace(/[^a-z0-9-]/g, '') + '.json';
    
    const filepath = path.join(topicDir, filename);
    
    const subtopicData = {
      topic: topicName,
      subtopic: subtopicName,
      keywords: [],
      sources: papers
    };
    
    fs.writeFileSync(filepath, JSON.stringify(subtopicData, null, 2));
  }
  
  console.log(`  ✓ Saved ${Object.keys(newSubtopics).length} subtopic files`);
}

async function redistributeAll() {
  console.log('=== Redistributing Papers Between Subtopics ===\n');
  
  const topicDirs = fs.readdirSync(TOPICS_DIR)
    .filter(f => fs.statSync(path.join(TOPICS_DIR, f)).isDirectory());
  
  let processedTopics = 0;
  
  for (const topicDir of topicDirs) {
    const topicPath = path.join(TOPICS_DIR, topicDir);
    
    // Find topic name from patterns
    let topicName = null;
    for (const [name, patterns] of Object.entries(SUBTOPIC_PATTERNS)) {
      if (name.toLowerCase().replace(/\s+/g, '-') === topicDir) {
        topicName = name;
        break;
      }
    }
    
    if (!topicName) {
      console.log(`\n⚠ Skipping ${topicDir} (no patterns defined)`);
      continue;
    }
    
    await redistributeTopic(topicName, topicPath, SUBTOPIC_PATTERNS[topicName]);
    processedTopics++;
  }
  
  console.log(`\n✓ Redistribution complete`);
  console.log(`  Topics processed: ${processedTopics}`);
  console.log('\nNext step: Run "npm run build" to regenerate keywords');
}

redistributeAll().catch(console.error);
