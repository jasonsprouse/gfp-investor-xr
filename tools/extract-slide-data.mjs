// One-off build script: extracts HARPS_SLIDES and PRISMATIC_SLIDES from the digital-golden-plates
// HTML decks into JSON files for the XR booths.
// Usage: node tools/extract-slide-data.mjs [path-to-digital-golden-plates]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = process.argv[2] || 'C:/Users/jason/.gemini/antigravity/scratch/digital-golden-plates-ref';

// Returns the source text of `const NAME = [ ... ];` using string-aware bracket matching.
function extractArrayLiteral(html, name) {
  const marker = new RegExp(`const\\s+${name}\\s*=\\s*\\[`);
  const m = marker.exec(html);
  if (!m) throw new Error(`${name} not found`);
  const start = m.index + m[0].length - 1; // index of '['
  let depth = 0;
  let quote = null;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated array for ${name}`);
}

function load(file, name) {
  const html = fs.readFileSync(path.join(source, file), 'utf8');
  const literal = extractArrayLiteral(html, name);
  return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 2000 });
}

const baseName = (p) => (p ? path.basename(p) : null);

// --- Harps deck ---
const harps = load('nft_harps_presentation.html', 'HARPS_SLIDES').map((s) => ({
  num: s.num,
  time: s.time,
  category: s.category,
  title: s.title,
  subtitle: s.subtitle,
  img1: baseName(s.img1),
  img2: baseName(s.img2),
  cap1: s.cap1,
  cap2: s.cap2,
  video_points: s.video_points || [],
  gfp_points: s.gfp_points || []
}));

// --- Prismatic deck ---
const prismatic = load('prismatic_architecture.html', 'PRISMATIC_SLIDES').map((s) => ({
  num: s.num,
  time: s.time,
  title: s.title,
  synthesis: s.synthesis,
  narration: s.narration
}));

function write(rel, data) {
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(`${rel}: ${data.length} slides`);
}

write('media/booths/harps/slides.json', harps);
write('media/booths/prismatic/slides.json', prismatic);
