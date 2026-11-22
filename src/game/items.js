import { LOOT_TABLES } from "../content/items.js";

export const SLOTS = [
  { id: "weapon", name: "Arma" },
  { id: "charm", name: "Amuleto" },
  { id: "head", name: "Cabeza" },
];

export const RARITY_NAMES = {
  common: "Común",
  rare: "Raro",
  boss: "De jefe",
};

export const MAX_GEAR_LEVEL = 25;
export const CORE_UPGRADE_LEVELS = 2;

/**
 * Traduce el texto libre de `effect` del contenido a una regla de juego.
 * Los porcentajes de curación se aplican sobre la salud máxima.
 */
export function parseEffect(effect) {
  const text = String(effect || "").trim().toLowerCase();
  let match = text.match(/^cura (\d+)$/);
  if (match) {
    return { kind: "heal", percent: Number(match[1]) };
  }
  match = text.match(/^\+(\d+) ataque$/);
  if (match) {
    return { kind: "gear", slot: "weapon", attack: Number(match[1]), defense: 0 };
  }
  match = text.match(/^\+(\d+) defensa$/);
  if (match) {
    return { kind: "gear", slot: "charm", attack: 0, defense: Number(match[1]) };
  }
  match = text.match(/^\+(\d+) poder$/);
  if (match) {
    // El poder es la suma de ataque y defensa, así que se reparte entre ambos.
    const half = Number(match[1]) / 2;
    return { kind: "gear", slot: "head", attack: half, defense: half };
  }
  if (text === "util") {
    return { kind: "rope" };
  }
  if (text === "upgrade") {
    return { kind: "upgrade", levels: CORE_UPGRADE_LEVELS };
  }
  return { kind: "misc" };
}

const CATALOG = new Map();
for (const [rarity, table] of Object.entries(LOOT_TABLES)) {
  for (const item of table) {
    CATALOG.set(item.id, { ...item, rarity, ...parseEffect(item.effect) });
  }
}

export function getItem(id) {
  return CATALOG.get(id);
}

export function getAllItems() {
  return [...CATALOG.values()];
}

/** Bonificación de una pieza de equipo: cada nivel de mejora suma otra vez la base. */
export function gearBonus(item, level = 0) {
  if (!item || item.kind !== "gear") {
    return { attack: 0, defense: 0 };
  }
  return {
    attack: item.attack * (1 + level),
    defense: item.defense * (1 + level),
  };
}

export function gearScore(piece) {
  if (!piece) {
    return -1;
  }
  const bonus = gearBonus(getItem(piece.id), piece.level);
  return bonus.attack + bonus.defense;
}

export function itemLabel(item, level) {
  if (!item) {
    return "Objeto desconocido";
  }
  return item.kind === "gear" && level > 0 ? `${item.name} +${level}` : item.name;
}

export function describeItem(item, level = 0, healBonus = 1) {
  switch (item?.kind) {
    case "heal":
      return `Restaura el ${Math.round(item.percent * healBonus)} % de la salud máxima.`;
    case "rope":
      return "Úsala en un piso para bajar a Rubi y poder volver al mismo punto.";
    case "upgrade":
      return `Sube ${item.levels} niveles una pieza de equipo.`;
    case "gear": {
      const bonus = gearBonus(item, level);
      const parts = [];
      if (bonus.attack) {
        parts.push(`+${bonus.attack} ataque`);
      }
      if (bonus.defense) {
        parts.push(`+${bonus.defense} defensa`);
      }
      return parts.join(" y ");
    }
    default:
      return "Sin uso conocido.";
  }
}

// --- Mochila: lista inmutable de entradas { id, qty, level? } ---

export function entryKey(entry) {
  return entry.level === undefined ? entry.id : `${entry.id}+${entry.level}`;
}

export function findEntry(items, key) {
  return items.find((entry) => entryKey(entry) === key);
}

export function countItem(items, id) {
  return items
    .filter((entry) => entry.id === id)
    .reduce((total, entry) => total + entry.qty, 0);
}

export function addItem(items, id, { qty = 1, level } = {}) {
  const item = getItem(id);
  const entry = item?.kind === "gear" ? { id, qty, level: level || 0 } : { id, qty };
  const key = entryKey(entry);
  if (findEntry(items, key)) {
    return items.map((existing) =>
      entryKey(existing) === key ? { ...existing, qty: existing.qty + qty } : existing
    );
  }
  return [...items, entry];
}

export function removeItem(items, key, qty = 1) {
  return items
    .map((entry) => (entryKey(entry) === key ? { ...entry, qty: entry.qty - qty } : entry))
    .filter((entry) => entry.qty > 0);
}
