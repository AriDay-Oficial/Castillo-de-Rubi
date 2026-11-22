// Sprites de estilo pixel-art dibujados como texto: cada carácter es un píxel
// y cada letra, un color de la paleta. Se pintan como SVG en línea, así que no
// hay imágenes que descargar.

const BASE = {
  k: "#0c0d12",
  w: "#f1ece0",
  g: "#aab3c2",
  h: "#6b7486",
  y: "#ecc766",
  o: "#e08a3c",
  r: "#d54b4b",
  e: "#ffe08a",
};

const SHAPES = {
  bestia: {
    palette: { a: "#9a7b5c", b: "#6b533d" },
    rows: [
      "................",
      "................",
      "..a..a..........",
      "..aa.aa.........",
      ".aaaaaa....aaa..",
      ".aeaaaaaaaaaaaa.",
      "aaaaaaaaaaaaaaab",
      "waaaaaaaaaaaaaab",
      ".wbaaaaaaaaaaaab",
      "...bbaaaaaaaaab.",
      "....aaaaaaaaaab.",
      "....aabbbbbbaab.",
      "....ab.....ab...",
      "....ab.....ab...",
      "....ab.....ab...",
      "...aab....aab...",
    ],
  },
  humanoide: {
    palette: { a: "#7fae5a", b: "#557a3b", c: "#8a6a4a", d: "#5f4732" },
    rows: [
      "................",
      "................",
      ".....aaaaaa.....",
      "aa..aaaaaaaa..aa",
      ".aaaaaaaaaaaaaa.",
      "..aaekaaaakeaa..",
      "...aaaaaaaaaa...",
      "...aaawkkwaaa.g.",
      "....aaaaaaaa..g.",
      "...cccccccccc.g.",
      "..acccccccccca.g",
      "..accccddcccchhh",
      "..b.cccccccc..h.",
      "....ccc..ccc....",
      "....bb....bb....",
      "...bbb....bbb...",
    ],
  },
  "no-muerto": {
    palette: { a: "#f1ece0", b: "#b9b2a0" },
    rows: [
      "................",
      "....aaaaaaaa....",
      "...aaaaaaaaaa...",
      "...aaaaaaaaaa...",
      "...akkaaaakka...",
      "...akeaaaaeka...",
      "...aaaakkaaaa...",
      "....aaaaaaaa....",
      "....akakakab....",
      "......abba......",
      "..aa.aaaaaa.aa..",
      "..a.aakaakaa.a..",
      "..a..aaaaaa..a..",
      "..b.aakaakaa.b..",
      ".....aa..aa.....",
      "....bbb..bbb....",
    ],
  },
  mago: {
    palette: { a: "#7a5fb0", b: "#4f3c7a" },
    rows: [
      "..............e.",
      "......aaaa...eye",
      ".....aaaaaa...e.",
      "....aaaaaaaa..h.",
      "....aakkkkaa..h.",
      "....akekkeka..h.",
      "....akkkkkka..h.",
      "...aaakkkkaaa.h.",
      "..aaaaaaaaaaaah.",
      "..aaaabaabaaaah.",
      "..abaabaabaab.h.",
      "..b.aabaabaa..h.",
      "....aabaabaa..h.",
      "...aaabaabaaa.h.",
      "..aaaaaaaaaaaa..",
      "..bbbbbbbbbbbb..",
    ],
  },
  elemental: {
    palette: { a: "#b08a5a", b: "#7a5d3a", e: "#f4d58a" },
    rows: [
      "................",
      ".......aa.......",
      "......aaaa......",
      "..a..aaaaaa..a..",
      ".aaa.aaeeaa.aaa.",
      ".aba.aeeeea.aba.",
      "..b.aaaeeaaa.b..",
      "...aaaaaaaaaa...",
      "...abaaaaaaba...",
      "...abbaaaabba...",
      "....abbaabba....",
      ".....abbbba.....",
      "......abba......",
      "..a....bb....a..",
      ".aba........aba.",
      "..b..........b..",
    ],
  },
  gigante: {
    palette: { a: "#c0603c", b: "#8a3f27", c: "#5a4a3a", o: "#8a6a4a" },
    rows: [
      "................",
      ".....aaaaaa.....",
      "....aaaaaaaa....",
      "....aekaakea..oo",
      "....aaaaaaaa..oo",
      "..aaaawaawaaa.oo",
      ".aaaaaaaaaaaaaoo",
      "aaaaaaaaaaaaaaoo",
      "aaabaaaaaaaabaa.",
      "aab.aaaaaaaa.ba.",
      "aa..cccccccc....",
      "aa..cccccccc....",
      "....cccccccc....",
      "....aaa..aaa....",
      "....aaa..aaa....",
      "...bbbb..bbbb...",
    ],
  },
  elite: {
    palette: { a: "#5d6676", b: "#3c4352", c: "#8a93a6", e: "#ff7b6b" },
    rows: [
      "................",
      "..c..........c..",
      "..cc........cc..",
      "...ccaaaaaacc...",
      "....aaaaaaaa....",
      "....aeeaaeea....",
      "....aaaaaaaa..w.",
      "...baaaaaaaab.w.",
      "..ccaaaccaaaccw.",
      ".cccaaccccaaccw.",
      ".cc.aaccccaa.cw.",
      ".aa.aaaccaaa.yyy",
      ".aa.aaaaaaaa..y.",
      "....aab..baa....",
      "....aab..baa....",
      "...bbbb..bbbb...",
    ],
  },
  "guardian-del-bosque": {
    palette: { a: "#8a6a4a", b: "#5f4732", c: "#4f9a5a", d: "#35703f", e: "#d9f08a" },
    rows: [
      "....cccccccc....",
      "..cccdccccdccc..",
      ".ccdccccccccdcc.",
      "cccccccdccccccdc",
      "ccdcccccccdccccc",
      ".cccccdccccccdc.",
      "..cccaaaaaaccc..",
      "....aaaaaaaa....",
      "a...aeeaaeea...a",
      "aa..aaaaaaaa..aa",
      ".aa.aakkkkaa.aa.",
      "..aaaaaaaaaaaa..",
      "....aabaabaa....",
      "....aabaabaa....",
      "...aaabaabaaa...",
      "..aab.b..b.baa..",
    ],
  },
  "reina-elemental": {
    palette: { a: "#d8ecf5", c: "#58b6d8", d: "#2f7fa3", e: "#b9f3ff" },
    rows: [
      ".....y.yy.y.....",
      ".....yyyyyy.....",
      ".....aaaaaa.....",
      "....aakaakaa....",
      "....aaaaaaaa....",
      ".e...aarraa...e.",
      "ewe.ccaaaacc.ewe",
      ".e.cccccccccc.e.",
      "..acccccccccca..",
      ".aa.cccddccc.aa.",
      "....ccddddcc....",
      "...cccddddccc...",
      "...ccddddddcc...",
      "..cccddddddccc..",
      "..ccddddddddcc..",
      ".cccccccccccccc.",
    ],
  },
  "senor-de-cenizas": {
    palette: { a: "#8d8f99", b: "#4a4c57", e: "#ffb347" },
    rows: [
      ".o............o.",
      ".oo....rr....oo.",
      ".aoo..rooy..ooa.",
      ".aa..rooyor..aa.",
      ".aaa.aaaaaa.aaa.",
      "..aaaaaaaaaaaa..",
      "...aaeeaaeeaa...",
      "...aakeaaekaa...",
      "...aaaakkaaaa...",
      "....awawawaa....",
      "..bbbaaaaaabbb..",
      ".bbbbbbrrbbbbbb.",
      ".bb.bbroorbb.bb.",
      ".bb.bbbrrbbb.bb.",
      "....bbb..bbb....",
      "...bbbb..bbbb...",
    ],
  },
  "titan-raids": {
    palette: { a: "#8f8478", b: "#5c544b", e: "#c79bff" },
    rows: [
      "....aaaaaaaa....",
      "...aaaaaaaaaa...",
      "...aeeaaaaeea...",
      "...aaaaaaaaaa...",
      ".aaaaaaaeaaaaaa.",
      "aaaaaaaeeaaaaaaa",
      "aaabaaaaeaaabaaa",
      "aaabaaaeeaaabaaa",
      "aab.aaaaeeaa.baa",
      "aab.aaaeeaaa.baa",
      "aab.aaaaeaaa.baa",
      "aaa.aaaaaaaa.aaa",
      "bbb.aab..baa.bbb",
      "....aab..baa....",
      "...aaab..baaa...",
      "...bbbb..bbbb...",
    ],
  },
  "rey-catedral": {
    palette: { a: "#e9dcc6", c: "#5b4b8a", d: "#3d3163", r: "#b8323c", e: "#ffe08a" },
    rows: [
      "...y..y..y..y...",
      "...yyyyyyyyyy...",
      "...yryyeeyyry...",
      "....aaaaaaaa....",
      "....akeaaeka....",
      "....aaaaaaaa....",
      ".w...aakkaa.....",
      ".w.rrraaaarrr...",
      ".wrrccccccccrr..",
      ".w.accyyyycca.r.",
      "yyy.ccyddycc.rr.",
      ".h..ccyyyyccrrr.",
      "....ccccccccrr..",
      "....ccd..dccr...",
      "....cc....cc....",
      "...ddd....ddd...",
    ],
  },
  heroe: {
    palette: { a: "#7a5236", s: "#f0c8a0", c: "#3f8f8a", d: "#2c6763", b: "#5f4732" },
    rows: [
      "................",
      ".....aaaaaa.....",
      "....aaaaaaaa....",
      "....aassssaa..g.",
      "....askssksa..g.",
      "....assssssa..g.",
      ".....ssssss...g.",
      "....rrrrrrrr..g.",
      "..ycccccccccsyyy",
      ".yyyccccccc...h.",
      ".yryycccccc.....",
      ".yyyyccddcc.....",
      "..yy.cc..cc.....",
      ".....cc..cc.....",
      ".....bb..bb.....",
      "....bbb..bbb....",
    ],
  },
  "pocion-menor": {
    palette: { g: "#c9d6e6", h: "#8a6a4a" },
    rows: [
      "....hhhh....",
      "....gggg....",
      ".....gg.....",
      ".....gg.....",
      "....gggg....",
      "...grrrrg...",
      "..grrwrrrg..",
      "..grwrrrrg..",
      "..grrrrrrg..",
      "..grrrrrrg..",
      "...grrrrg...",
      "....gggg....",
    ],
  },
  hierbas: {
    palette: { a: "#6fbf73", b: "#3f8a4a", h: "#8a6a4a" },
    rows: [
      ".....a..a...",
      "..a..aa.aa..",
      "..aa.aaaab..",
      "..aaaaaabb..",
      ".a.aaaabba..",
      ".aaaaaabaa..",
      "..aaabbaa...",
      "...aabba....",
      "....hhh.....",
      "....yhy.....",
      "....hhh.....",
      "....h.h.....",
    ],
  },
  cuerda: {
    palette: { a: "#d1a871", b: "#9a7748" },
    rows: [
      "............",
      "...aaaaaa...",
      "..abbbbbba..",
      ".ab.aaaa.ba.",
      ".ab.a..a.ba.",
      ".abaa..aaba.",
      ".ab.aaaa.ba.",
      "..abbbbbba..",
      "...aaaaaaa..",
      "........aa..",
      ".......ab...",
      "......ab....",
    ],
  },
  "espada-antigua": {
    palette: { b: "#8a6a4a" },
    rows: [
      "..........gw",
      ".........gwg",
      "........gwg.",
      ".......gwg..",
      "......gwg...",
      ".....gwg....",
      ".y..gwg.....",
      ".yygwg......",
      "..yyg.......",
      ".byyy.......",
      "bb..yy......",
      "b...........",
    ],
  },
  "talisman-escarcha": {
    palette: { i: "#58b6d8" },
    rows: [
      "...y....y...",
      "..y......y..",
      "..y......y..",
      "...y....y...",
      "....y..y....",
      "....yyyy....",
      "...yiiiiy...",
      "..yiiwiiiy..",
      "..yiwiiiiy..",
      "..yiiiiiiy..",
      "...yiiiiy...",
      "....yyyy....",
    ],
  },
  "nucleo-elemental": {
    palette: { a: "#b9f3ff", b: "#58b6d8", c: "#7a5fb0" },
    rows: [
      "............",
      "....cccc....",
      "..ccbbbbcc..",
      ".cbbaaaabbc.",
      ".cbaawwaabc.",
      "cbbawwwaabbc",
      "cbbaawwaabbc",
      ".cbaaaaaabc.",
      ".cbbaaaabbc.",
      "..ccbbbbcc..",
      "....cccc....",
      "............",
    ],
  },
  "corona-oscura": {
    palette: { a: "#7a6aa8", b: "#4f4378" },
    rows: [
      "............",
      "............",
      ".a...aa...a.",
      ".aa..aa..aa.",
      ".aaa.aa.aaa.",
      ".aaaaaaaaaa.",
      ".araaerraaa.",
      ".aaaaaaaaaa.",
      ".yyyyyyyyyy.",
      ".bbbbbbbbbb.",
      "............",
      "............",
    ],
  },
};

// Cada enemigo usa la silueta de su familia con sus propios colores.
const ENEMY_LOOKS = {
  jabali: { shape: "bestia", palette: { a: "#9a7b5c", b: "#6b533d" } },
  lobo: { shape: "bestia", palette: { a: "#9aa3b2", b: "#6b7486", w: "#f1ece0" } },
  "bestia-del-pantano": { shape: "bestia", palette: { a: "#6f9a5a", b: "#48683a", e: "#ffb347" } },
  goblin: { shape: "humanoide" },
  "mercenario-de-hielo": {
    shape: "humanoide",
    palette: { a: "#e0c2a2", b: "#3f6f8a", c: "#7fb6d8", d: "#4f86a8" },
  },
  esqueleto: { shape: "no-muerto", palette: { e: "#0c0d12" } },
  "caballero-perdido": { shape: "no-muerto", palette: { a: "#b9c4d4", b: "#7d889b", e: "#ff7b6b" } },
  "sacerdote-sombrio": { shape: "mago" },
  "hechicero-ancestral": { shape: "mago", palette: { a: "#2f8f8a", b: "#1f615e", e: "#7ff0d0", y: "#d9fff2" } },
  "elemental-tierra": { shape: "elemental" },
  "elemental-hielo": { shape: "elemental", palette: { a: "#9fdcf0", b: "#58a6c8", e: "#ffffff" } },
  "troll-de-fuego": { shape: "gigante" },
  "guardian-oscuro": { shape: "elite", palette: { a: "#5a4a7a", b: "#3a3052", c: "#8a7ab0", e: "#c79bff" } },
  verdugo: { shape: "elite" },
  "serafin-caido": { shape: "elite", palette: { a: "#d9d2c0", b: "#9a927d", c: "#ecc766", e: "#58b6d8" } },
  arconte: { shape: "elite", palette: { a: "#3c3566", b: "#262145", c: "#6f5fc0", e: "#7ff0d0" } },
};

const FAMILIES = ["bestia", "humanoide", "no-muerto", "mago", "elemental", "gigante", "elite"];

export const SPRITE_IDS = Object.keys(SHAPES);

/** Agrupa los píxeles de cada color en un único trazado SVG. */
function buildPaths(rows, palette) {
  const runs = new Map();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === char) {
        end += 1;
      }
      if (char !== ".") {
        const color = palette[char];
        runs.set(color, `${runs.get(color) || ""}M${x} ${y}h${end - x}v1h${x - end}z`);
      }
      x = end;
    }
  });
  return [...runs].map(([color, d]) => `<path fill="${color}" d="${d}"/>`).join("");
}

const cache = new Map();

/**
 * SVG de un sprite. `size` es el lado en píxeles CSS; conviene que sea múltiplo
 * del lado de la rejilla (16 para criaturas, 12 para objetos) para que los
 * píxeles queden nítidos.
 */
export function spriteSvg(shapeId, { size = 32, palette = null, className = "" } = {}) {
  const shape = SHAPES[shapeId];
  if (!shape) {
    return "";
  }
  const key = `${shapeId}|${size}|${className}|${palette ? JSON.stringify(palette) : ""}`;
  if (!cache.has(key)) {
    const colors = { ...BASE, ...shape.palette, ...palette };
    const side = shape.rows.length;
    cache.set(
      key,
      `<svg class="sprite${className ? ` ${className}` : ""}" width="${size}" height="${size}" ` +
        `viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
        `${buildPaths(shape.rows, colors)}</svg>`
    );
  }
  return cache.get(key);
}

/** Silueta y colores de un enemigo o jefe a partir de su id y sus etiquetas. */
export function enemyLook({ id, tags = [] }) {
  if (SHAPES[id]) {
    return { shape: id, palette: null };
  }
  const look = ENEMY_LOOKS[id];
  if (look) {
    return { shape: look.shape, palette: look.palette || null };
  }
  return { shape: FAMILIES.find((family) => tags.includes(family)) || "bestia", palette: null };
}

export function enemySprite(enemy, options = {}) {
  const look = enemyLook(enemy);
  return spriteSvg(look.shape, { ...options, palette: look.palette });
}

export function itemSprite(itemId, options = {}) {
  return spriteSvg(itemId, { size: 24, ...options });
}

export function heroSprite(options = {}) {
  return spriteSvg("heroe", options);
}

/** Datos crudos, para las pruebas. */
export function spriteData(shapeId) {
  const shape = SHAPES[shapeId];
  return shape ? { rows: shape.rows, palette: { ...BASE, ...shape.palette } } : null;
}
