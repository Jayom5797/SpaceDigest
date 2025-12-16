<div align="center">

# 🌌 SpaceDigest

### AI-Powered Space Science Paper Search Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/Status-Production-success)](https://github.com/Jayom5797/SpaceDigest)
[![API](https://img.shields.io/badge/API-REST-orange)](https://github.com/Jayom5797/SpaceDigest)

**Find the right research papers in seconds, not hours**

[🚀 Live Demo](#) • [📖 Documentation](#) • [🔌 API](#use-as-a-microservice) • [💬 Support](#support)

---

</div>

## 🎯 What is SpaceDigest?

SpaceDigest is an **intelligent research assistant** that helps scientists, students, and space enthusiasts instantly find relevant academic papers from a vast collection of space science literature.

> **The Problem:** Researchers waste hours manually searching through thousands of papers or relying on generic search engines that don't understand scientific context.

> **The Solution:** SpaceDigest uses AI-powered classification to understand your research question and instantly retrieve the most relevant papers from specialized space science topics.

---

## 💡 Use Cases

<table>
<tr>
<td width="50%">

### 🔬 For Researchers
- ✅ **Fact-checking** scientific claims with peer-reviewed sources
- ✅ **Literature review** - gather papers on specific topics quickly
- ✅ **Citation discovery** - find authoritative sources
- ✅ **Cross-topic exploration** - discover connections between fields

</td>
<td width="50%">

### 🎓 For Students
- ✅ **Homework & assignments** - find credible sources fast
- ✅ **Learning new topics** - access expert knowledge
- ✅ **Thesis research** - build comprehensive bibliographies
- ✅ **Study materials** - understand complex concepts

</td>
</tr>
<tr>
<td width="50%">

### ✍️ For Science Communicators
- ✅ **Fact verification** - ensure accuracy in articles
- ✅ **Source attribution** - find original research
- ✅ **Deep dives** - access technical details
- ✅ **Content creation** - backed by real science

</td>
<td width="50%">

### 💻 For Developers
- ✅ **Microservice integration** - add paper search to apps
- ✅ **AI training data** - access structured literature
- ✅ **Research automation** - build intelligent tools
- ✅ **Scientific APIs** - power your applications

</td>
</tr>
</table>

---

## ✨ Key Features

<div align="center">

| Feature | Description |
|---------|-------------|
| 🔍 **Intelligent Search** | Ask questions in natural language - no complex queries needed |
| 🎯 **Smart Classification** | Automatically organized into 14 topics and 84 specialized subtopics |
| ⚡ **Lightning Fast** | Get results in milliseconds with full-text search |
| 🌐 **Always Available** | Cloud-hosted with 99.9% uptime |
| 🔓 **Open Access** | Free to use, no registration, no API limits |
| 📱 **Responsive** | Works on desktop, tablet, and mobile |

</div>

---

## 🚀 How It Works

```mermaid
graph LR
    A[Enter Query] --> B[AI Classification]
    B --> C[Topic Detection]
    C --> D[Subtopic Matching]
    D --> E[Retrieve Papers]
    E --> F[Ranked Results]
    style A fill:#667eea
    style F fill:#10b981
```

<div align="center">

### Simple 4-Step Process

**1️⃣ Enter your question** → **2️⃣ AI classifies query** → **3️⃣ Get instant results** → **4️⃣ Access full papers**

</div>

---

## 📝 Example Queries

<table>
<tr>
<td>

**Astrophysics**
```
Can neutron stars exceed 5 solar masses?
```

</td>
<td>

**Cosmology**
```
Evidence for dark matter in galaxy rotation curves
```

</td>
</tr>
<tr>
<td>

**Exoplanets**
```
Methods for detecting exoplanet atmospheres
```

</td>
<td>

**Black Holes**
```
Hawking radiation experimental evidence
```

</td>
</tr>
</table>

---

## 🛠️ Use as a Microservice

Perfect for integrating scientific paper search into your applications!

### Quick Start

```bash
# POST request to the API
curl -X POST https://your-api-url/api/get-sources \
  -H "Content-Type: application/json" \
  -d '{"claim": "Neutron stars can exceed 5 solar masses"}'
```

### Request Format

```json
{
  "claim": "Your research question or scientific claim"
}
```

### Response Format

```json
{
  "domain": "Space Science",
  "topic": "neutron-stars",
  "subtopic": "mass-limits",
  "sources": [
    {
      "title": "Testing dark decays of baryons in neutron stars",
      "authors": "Gordon Baym, D. H. Beck, Peter Geltenbort, Jessie Shelton",
      "abstract": "We demonstrate that the observation of neutron stars...",
      "arxiv": "1802.08282",
      "url": "https://arxiv.org/abs/1802.08282",
      "year": 2018
    }
  ],
  "totalSources": 50,
  "queryTime": 45,
  "relevance": 5
}
```

### Integration Examples

<details>
<summary><b>JavaScript / Node.js</b></summary>

```javascript
async function searchPapers(query) {
  const response = await fetch('https://your-api-url/api/get-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim: query })
  });
  return await response.json();
}

// Usage
const results = await searchPapers('Dark matter detection methods');
console.log(`Found ${results.totalSources} papers in ${results.queryTime}ms`);
```

</details>

<details>
<summary><b>Python</b></summary>

```python
import requests

def search_papers(query):
    response = requests.post(
        'https://your-api-url/api/get-sources',
        json={'claim': query}
    )
    return response.json()

# Usage
results = search_papers('Dark matter detection methods')
print(f"Found {results['totalSources']} papers in {results['queryTime']}ms")
```

</details>

<details>
<summary><b>cURL</b></summary>

```bash
curl -X POST https://your-api-url/api/get-sources \
  -H "Content-Type: application/json" \
  -d '{"claim": "Dark matter detection methods"}' \
  | jq '.sources[0].title'
```

</details>

---

## 📊 Coverage

<div align="center">

### Full Spectrum of Space Science Research

</div>

| Category | Topics Covered |
|----------|----------------|
| **🌑 Compact Objects** | Black holes, neutron stars, white dwarfs, stellar evolution |
| **🌌 Cosmology** | Big Bang, CMB, inflation, dark energy, large-scale structure |
| **🪐 Planetary Science** | Exoplanets, solar system, planetary formation, atmospheres |
| **⭐ Stellar Physics** | Star formation, stellar astrophysics, supernovae |
| **🔭 Observational** | Instrumentation, methods, multi-wavelength astronomy |
| **🌀 Galactic** | Galaxy formation, AGN, galaxy structure, evolution |
| **🌊 Gravitational Waves** | Detection, sources, LIGO/Virgo observations |
| **☀️ Solar Physics** | Sun, solar wind, space weather, heliosphere |

---

## 🎓 Who Should Use SpaceDigest?

<div align="center">

| Role | Primary Benefit |
|------|----------------|
| 🔬 **Graduate Students** | Accelerate literature reviews and thesis research |
| 👨‍🔬 **Researchers** | Verify claims and discover citations instantly |
| 👨‍🏫 **Educators** | Prepare course materials with authoritative sources |
| ✍️ **Science Writers** | Fact-check articles with peer-reviewed papers |
| 💻 **Developers** | Build research tools with scientific knowledge |
| 🌟 **Space Enthusiasts** | Learn from primary sources, not pop-sci articles |

</div>

---

## 🌟 Why SpaceDigest?

<table>
<tr>
<th width="50%">❌ Traditional Search Problems</th>
<th width="50%">✅ SpaceDigest Solutions</th>
</tr>
<tr>
<td>

- Generic search engines return irrelevant results
- Manual classification is time-consuming
- No understanding of scientific context
- Difficult to find specific subtopics
- Overwhelming number of results

</td>
<td>

- AI-powered relevance ranking
- Automatic topic classification
- Understands scientific terminology
- Organized by specialized subtopics
- Curated, ranked results

</td>
</tr>
</table>

---

## 🔮 Roadmap

- [ ] **Multi-domain support** - Expand beyond space science
- [ ] **Citation network** - Visualize paper relationships
- [ ] **Saved searches** - Track topics over time
- [ ] **Email alerts** - Get notified of new papers
- [ ] **Advanced filters** - Year, author, journal, citations
- [ ] **Export formats** - BibTeX, RIS, EndNote
- [ ] **Collaboration tools** - Share searches with teams

---

## 🤝 Contributing

SpaceDigest is built for the scientific community. We welcome:

- 🐛 Bug reports and feature requests
- 📚 Paper database contributions
- 💡 API integration examples
- 📖 Documentation improvements
- 🌍 Translations

See [CONTRIBUTING.md](#) for guidelines.

---

## 📜 License

```
MIT License - Free to use for research, education, and commercial applications
```

---

## 🔗 Links

<div align="center">

[![Website](https://img.shields.io/badge/Website-Live-success?style=for-the-badge)](https://your-url.vercel.app)
[![API Docs](https://img.shields.io/badge/API-Documentation-blue?style=for-the-badge)](#use-as-a-microservice)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?style=for-the-badge)](https://github.com/Jayom5797/SpaceDigest)

</div>

---

## 💬 Support

<div align="center">

**Questions? Suggestions? Need help?**

[Open an Issue](https://github.com/Jayom5797/SpaceDigest/issues) • [Discussions](https://github.com/Jayom5797/SpaceDigest/discussions)

</div>

---

<div align="center">

### 🌌 SpaceDigest

**Making space science research accessible to everyone**

*Built with ❤️ for the scientific community*

---

**[⬆ Back to Top](#-spacedigest)**

</div>
