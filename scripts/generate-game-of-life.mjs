// Generate an animated SVG from the GitHub contribution calendar.
// Uses the contribution calendar exposed by GitHub GraphQL and evolves it
// with a four-state, decaying Game-of-Life variant inspired by Edward Thomson.
//
// Required environment:
//   GITHUB_TOKEN - Actions' built-in token
//   GITHUB_USER  - username to render (default: degarg-ctrl)

const fs = require("node:fs");

const token = process.env.GITHUB_TOKEN;
const login = process.env.GITHUB_USER || "degarg-ctrl";

if (!token) throw new Error("GITHUB_TOKEN is required");

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            contributionCount
            color
          }
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "degarg-ctrl-game-of-life-generator"
  },
  body: JSON.stringify({ query, variables: { login } })
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status}`);
}

const json = await response.json();
if (json.errors?.length) {
  throw new Error(json.errors.map(e => e.message).join("; "));
}

const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;

// GitHub's calendar is 53 columns x 7 rows.
const cols = weeks.length;
const rows = 7;

const colors = ["#161B22", "#0E4429", "#006D32", "#26A641", "#39D353"];

function intensity(count) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

let grid = Array.from({ length: rows }, () => Array(cols).fill(0));

for (let x = 0; x < cols; x++) {
  for (let y = 0; y < rows; y++) {
    const day = weeks[x].contributionDays[y];
    grid[y][x] = intensity(day.contributionCount);
  }
}

// Four-state decaying Game of Life.
// 0 = dead, 1..4 = contribution intensity.
// A live cell survives with 2/3 neighbours; a dead cell is born with 3.
// Instead of dying instantly, high-intensity cells decay one level at a time.
function step(src) {
  const out = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let neighbors = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            if (src[ny][nx] > 0) neighbors++;
          }
        }
      }

      const current = src[y][x];

      if (current > 0) {
        if (neighbors === 2 || neighbors === 3) {
          out[y][x] = Math.max(1, current - 1);
        } else {
          out[y][x] = Math.max(0, current - 2);
        }
      } else if (neighbors === 3) {
        out[y][x] = 2;
      }
    }
  }

  return out;
}

const frames = [grid];
for (let i = 0; i < 7; i++) frames.push(step(frames.at(-1)));

const cell = 11;
const gap = 3;
const boardW = cols * (cell + gap);
const boardH = rows * (cell + gap);

const esc = s => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const groups = frames.map((frame, index) => {
  const rects = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const state = frame[y][x];
      if (state === 0) continue;
      const fill = colors[state];
      rects.push(
        `<rect x="${x * (cell + gap)}" y="${y * (cell + gap)}" width="${cell}" height="${cell}" rx="2" fill="${fill}"/>`
      );
    }
  }

  const begin = `${index * 1.15}s`;
  return `<g opacity="0">
  ${rects.join("")}
  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.86;1"
           dur="1.15s" begin="${begin}" repeatCount="indefinite"/>
</g>`;
}).join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 410" role="img">
<defs>
  <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="1000" height="410" rx="22" fill="#0D1117"/>
<text x="500" y="38" text-anchor="middle" fill="#8B949E"
      font-family="monospace" font-size="13" letter-spacing="3">
  MY GITHUB CONTRIBUTIONS AS A GAME OF LIFE
</text>

<g transform="translate(${(1000 - boardW) / 2} 92)">
  <rect x="-22" y="-22" width="${boardW + 44}" height="${boardH + 44}"
        rx="14" fill="#080C12" stroke="#30363D"/>
  ${groups}
</g>

<g font-family="monospace">
  <text x="500" y="320" text-anchor="middle" fill="#C9D1D9" font-size="14">
    CONTRIBUTION GRAPH → INITIAL STATE → CELLULAR EVOLUTION
  </text>
  <text x="500" y="347" text-anchor="middle" fill="#8B949E" font-size="11">
    Four contribution intensities decay and evolve instead of simply disappearing.
  </text>
  <text x="500" y="380" text-anchor="middle" fill="#58A6FF" font-size="11">
    INSPIRED BY EDWARD THOMSON · github.com/ethomson#how-does-it-work
  </text>
</g>
</svg>`;

fs.mkdirSync("assets", { recursive: true });
fs.writeFileSync("assets/game-of-life.svg", svg);
console.log(`Generated ${cols} × ${rows} contribution grid for ${esc(login)}`);
