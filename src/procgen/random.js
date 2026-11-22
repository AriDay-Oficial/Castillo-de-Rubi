// Generador pseudoaleatorio determinista: la misma semilla produce siempre
// la misma secuencia, en cualquier navegador y en Node.

function hashSeed(text) {
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/**
 * Crea un generador con semilla (mulberry32). Devuelve una función que da
 * números en el intervalo [0, 1), igual que Math.random.
 */
export function createRng(seed) {
  let state = hashSeed(String(seed ?? ""));

  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Elige un elemento de la lista; devuelve undefined si está vacía. */
export function pick(rng, list) {
  if (!Array.isArray(list) || list.length === 0) {
    return undefined;
  }
  return list[Math.floor(rng() * list.length)];
}

/** Entero aleatorio entre min y max, ambos incluidos. */
export function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}
