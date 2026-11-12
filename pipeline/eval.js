// Retrieval evaluation: hit rate @1/@3/@5 and MRR for each search mode.
// Usage (app server running): node pipeline/eval.js [http://localhost:5173]
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:5173';
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'eval_questions.json'), 'utf8'));
const MODES = ['bm25', 'vector', 'hybrid', 'rerank'];

// Use the app's own synonym expansion (public/js/kb.js) so the eval sends exactly what the app sends.
let keywords = () => '';
const kbSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'js', 'kb.js'), 'utf8');

function hitRank(results, expect) {
  const res = expect.map(e => new RegExp(e, 'i'));
  const i = results.findIndex(r => res.every(re => re.test(`${r.header}\n${r.text}`)));
  return i < 0 ? null : i + 1;
}

(async () => {
  keywords = (await import('data:text/javascript;base64,' + Buffer.from(kbSource).toString('base64'))).expandTerms;
  const report = {};
  const misses = {};
  for (const mode of MODES) {
    const ranks = [];
    const times = [];
    for (const item of QUESTIONS) {
      const t = Date.now();
      const res = await fetch(`${BASE}/api/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: item.q, keywords: keywords(item.q), mode, k: 5 }),
      });
      const json = await res.json();
      times.push(Date.now() - t);
      if (json.notes?.length && mode !== 'bm25') console.warn(`[${mode}] ${json.notes.join('; ')}`);
      const rank = hitRank(json.results || [], item.expect);
      ranks.push(rank);
      if (!rank) (misses[mode] ||= []).push(`${item.q}  →  ${(json.results?.[0]?.header || 'nothing').slice(-90)}`);
    }
    const n = ranks.length;
    const at = k => ranks.filter(r => r && r <= k).length / n;
    const byLang = lang => {
      const idx = QUESTIONS.map((q, i) => (q.lang === lang ? i : -1)).filter(i => i >= 0);
      return idx.filter(i => ranks[i] && ranks[i] <= 5).length / idx.length;
    };
    times.sort((a, b) => a - b);
    report[mode] = {
      'hit@1': at(1).toFixed(2), 'hit@3': at(3).toFixed(2), 'hit@5': at(5).toFixed(2),
      MRR: (ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / n).toFixed(2),
      'hit@5 English': byLang('en').toFixed(2), 'hit@5 Roman Urdu': byLang('roman_urdu').toFixed(2),
      'median ms': times[Math.floor(n / 2)], 'p90 ms': times[Math.floor(n * 0.9)],
    };
    console.error(`${mode} done`);
  }
  console.log(`Questions: ${QUESTIONS.length}`);
  console.table(report);
  for (const [mode, list] of Object.entries(misses)) {
    console.log(`\nMisses (${mode}, ${list.length}):`);
    list.forEach(m => console.log('  - ' + m));
  }
})();
