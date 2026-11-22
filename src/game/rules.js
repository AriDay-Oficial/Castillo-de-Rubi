import { FLOOR_ZONES, MAX_FLOOR } from "../content/floors.js";
import { getEnemyTier } from "../content/enemies.js";
import { gearBonus, getItem, MAX_GEAR_LEVEL } from "./items.js";
import { getEffect } from "./skills.js";

// Todos los números de equilibrio están aquí. El contenido de src/content
// solo da un «poder» por enemigo; estas fórmulas lo convierten en estadísticas.
export const BALANCE = {
  maxEnergy: 5,
  player: {
    hp: 100,
    hpPerLevel: 20,
    attack: 20,
    attackPerLevel: 4,
    defense: 12,
    defensePerLevel: 2,
    critChance: 0.08,
    critMultiplier: 1.75,
  },
  xp: { base: 40, perLevel: 30 },
  enemy: {
    hpBase: -24,
    hpPerPower: 11,
    attackBase: -1.5,
    attackPerPower: 1.5,
    defensePerPower: 0.4,
    missChance: 0.08,
    // En grupo cada enemigo pega algo menos y tiene menos salud, para que la
    // amenaza crezca con el número de enemigos y no con su cuadrado.
    packAttack: [1, 0.8, 0.7],
  },
  // Cada dificultad de zona (src/content/floors.js) endurece a sus enemigos
  // para compensar el equipo y las habilidades que el jugador ya tiene.
  difficulty: {
    tutorial: { hp: 1, attack: 1 },
    baja: { hp: 1, attack: 1 },
    media: { hp: 1.15, attack: 1.45 },
    "media-alta": { hp: 1.3, attack: 1.75 },
    alta: { hp: 1.4, attack: 2.05 },
    elite: { hp: 1.5, attack: 2.2 },
    extrema: { hp: 1.4, attack: 2.05 },
    legendaria: { hp: 1.5, attack: 2.2 },
  },
  boss: {
    hpMultiplier: 2,
    // Ciclo del jefe: dos ataques, un turno de preparación y un golpe devastador.
    pattern: ["attack", "attack", "charge", "blast"],
    blastMultiplier: 2.5,
    xpPerPower: 6,
    goldPerPower: 8,
  },
  // Crecimiento del último tramo de enemigos, que no tiene un tramo siguiente.
  finalTierGrowth: 1.5,
  damageSpread: 0.15,
  fleeChance: 0.6,
  events: {
    magia: { power: 1.15, rewards: 1.3 },
    patrulla: { gold: 2 },
    altar: { heal: 0.3 },
    mercader: { markup: 1.25 },
  },
  dropLevelEvery: 10,
  upgradeCost: 120,
  deathGoldLoss: 0.5,
  freeRestHeal: 0.5,
  sellRatio: 0.4,
  starterKit: [
    { id: "pocion-menor", qty: 1 },
    { id: "hierbas", qty: 2 },
    { id: "cuerda", qty: 1 },
  ],
};

// Rasgos por etiqueta de enemigo: multiplican sus estadísticas base.
export const TAG_TRAITS = {
  bestia: { name: "Bestia", hint: "Feroz pero frágil", attack: 1.1, hp: 0.9 },
  humanoide: { name: "Humanoide", hint: "Lleva más oro", gold: 1.25 },
  "no-muerto": { name: "No muerto", hint: "Resistente y lento", hp: 1.2, attack: 0.9 },
  elemental: { name: "Elemental", hint: "Piel dura", defense: 1.5, hp: 1.1 },
  mago: { name: "Mago", hint: "Pega fuerte y aguanta poco", attack: 1.25, hp: 0.8 },
  gigante: { name: "Gigante", hint: "Mucha salud", hp: 1.35 },
  elite: { name: "Élite", hint: "Superior en todo", hp: 1.1, attack: 1.1 },
};

function tagMultiplier(tags, stat) {
  return (tags || []).reduce((total, tag) => total * (TAG_TRAITS[tag]?.[stat] ?? 1), 1);
}

// --- Progresión del personaje ---

export function xpToNext(level) {
  return BALANCE.xp.base + BALANCE.xp.perLevel * (level - 1);
}

export function baseStats(level) {
  const { player } = BALANCE;
  return {
    maxHp: player.hp + player.hpPerLevel * (level - 1),
    attack: Math.round(player.attack + player.attackPerLevel * (level - 1)),
    defense: Math.round(player.defense + player.defensePerLevel * (level - 1)),
  };
}

/** Estadísticas finales del jugador: nivel + equipo + habilidades. */
export function getPlayerStats(state) {
  const base = baseStats(state.player.level);
  const gear = { attack: 0, defense: 0 };
  for (const piece of Object.values(state.equipment || {})) {
    if (piece) {
      const bonus = gearBonus(getItem(piece.id), piece.level);
      gear.attack += bonus.attack;
      gear.defense += bonus.defense;
    }
  }
  const { skills } = state;
  const maestria = getEffect(skills, "maestria");
  const guardia = getEffect(skills, "guardia");

  return {
    maxHp: base.maxHp,
    attack: Math.round((base.attack + gear.attack) * (1 + maestria.attack)),
    defense: Math.round((base.defense + gear.defense) * (1 + guardia.defense)),
    critChance: BALANCE.player.critChance + maestria.crit,
    critMultiplier: BALANCE.player.critMultiplier,
    block: guardia.block,
    healBonus: 1 + getEffect(skills, "alquimia").heal,
    goldBonus: 1 + getEffect(skills, "comercio").gold,
    forgeDiscount: getEffect(skills, "forja").discount,
    gear,
  };
}

// --- Enemigos ---

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

// Un tramo es el rango de pisos que comparte la misma lista de enemigos.
function buildTierSpans() {
  const spans = [];
  for (const zone of FLOOR_ZONES) {
    if (zone.range[1] < 1) {
      continue;
    }
    const tier = getEnemyTier(zone.difficulty);
    const last = spans[spans.length - 1];
    if (last && last.tier === tier) {
      last.end = zone.range[1];
    } else {
      spans.push({ tier, start: Math.max(1, zone.range[0]), end: zone.range[1] });
    }
  }
  spans.forEach((span, index) => {
    const next = spans[index + 1];
    const ownAverage = average(span.tier.map((enemy) => enemy.power));
    span.growth = next
      ? average(next.tier.map((enemy) => enemy.power)) / ownAverage
      : BALANCE.finalTierGrowth;
  });
  return spans;
}

const TIER_SPANS = buildTierSpans();

/**
 * Dentro de un tramo los enemigos se fortalecen piso a piso hasta alcanzar
 * el poder medio del tramo siguiente, para que no haya saltos bruscos.
 */
export function powerMultiplier(floor) {
  const span =
    TIER_SPANS.find((candidate) => floor >= candidate.start && floor <= candidate.end) ||
    TIER_SPANS[TIER_SPANS.length - 1];
  const clamped = Math.min(Math.max(floor, span.start), span.end);
  const progress = (clamped - span.start) / (span.end - span.start + 1);
  return 1 + (span.growth - 1) * progress;
}

export function packHpFactor(count) {
  return 2 / (count + 1);
}

export function packAttackFactor(count) {
  const factors = BALANCE.enemy.packAttack;
  return factors[Math.min(count, factors.length) - 1];
}

export function enemyStats(power, tags, count = 1, difficulty = "baja") {
  const { enemy } = BALANCE;
  const tough = BALANCE.difficulty[difficulty] || BALANCE.difficulty.baja;
  const hp =
    (enemy.hpBase + enemy.hpPerPower * power) *
    tough.hp *
    tagMultiplier(tags, "hp") *
    packHpFactor(count);
  return {
    maxHp: Math.max(1, Math.round(hp)),
    attack: Math.max(
      1,
      Math.round(
        (enemy.attackBase + enemy.attackPerPower * power) *
          tough.attack *
          tagMultiplier(tags, "attack") *
          packAttackFactor(count)
      )
    ),
    defense: Math.round(enemy.defensePerPower * power * tagMultiplier(tags, "defense")),
  };
}

export function bossStats(power, difficulty) {
  const stats = enemyStats(power, [], 1, difficulty);
  return {
    ...stats,
    maxHp: Math.round(stats.maxHp * BALANCE.boss.hpMultiplier),
  };
}

export function goldTagBonus(tags) {
  return tagMultiplier(tags, "gold");
}

// --- Daño ---

/**
 * Daño = ataque × ataque / (ataque + defensa): una defensa igual al ataque
 * rival deja el golpe en la mitad. `roll` va de 0 a 1 y da la variación.
 */
export function computeDamage(attack, defense, roll = 0.5, multiplier = 1) {
  const spread = 1 - BALANCE.damageSpread + 2 * BALANCE.damageSpread * roll;
  const mitigation = attack / (attack + Math.max(0, defense));
  return Math.max(1, Math.round(attack * mitigation * spread * multiplier));
}

// Proporción de la salud actual que costaría el combate según la estimación.
const DANGER_LEVELS = [
  { id: "facil", name: "Fácil", limit: 0.25 },
  { id: "moderado", name: "Moderado", limit: 0.55 },
  { id: "peligroso", name: "Peligroso", limit: 1 },
  { id: "extremo", name: "Extremo", limit: Infinity },
];

/**
 * Estima el peligro de un combate simulándolo con golpes medios, solo con
 * ataques básicos y sin curarse, y lo compara con la salud actual. «Extremo»
 * significa que no se sobrevive sin técnicas ni curación.
 */
export function estimateDanger(stats, hp, enemies, isBoss = false) {
  const foes = enemies.filter((enemy) => enemy.hp > 0).map((enemy) => ({ ...enemy }));
  const critFactor = 1 + stats.critChance * (stats.critMultiplier - 1);
  const pattern = BALANCE.boss.pattern;
  const bossFactor = isBoss
    ? pattern.reduce(
        (total, step) =>
          total + (step === "attack" ? 1 : step === "blast" ? BALANCE.boss.blastMultiplier * (1 - stats.block) : 0),
        0
      ) / pattern.length
    : 1;
  let taken = 0;
  let turns = 0;
  while (foes.length > 0 && turns < 500) {
    turns += 1;
    foes[0].hp -= computeDamage(stats.attack, foes[0].defense) * critFactor;
    if (foes[0].hp <= 0) {
      foes.shift();
    }
    for (const foe of foes) {
      taken += computeDamage(foe.attack, stats.defense) * (1 - BALANCE.enemy.missChance) * bossFactor;
    }
  }
  const ratio = taken / Math.max(1, hp);
  const level = DANGER_LEVELS.find((candidate) => ratio < candidate.limit);
  return { id: level.id, name: level.name, ratio };
}

// --- Botín y economía ---

export function dropLevel(floor) {
  return Math.min(MAX_GEAR_LEVEL, Math.floor(floor / BALANCE.dropLevelEvery));
}

export function buyPrice(item, playerLevel, markup = 1) {
  let base;
  switch (item.kind) {
    case "heal":
      base = (item.percent / 20) * (10 + 4 * playerLevel);
      break;
    case "rope":
      base = 10 + 2 * playerLevel;
      break;
    case "gear":
      base = 60;
      break;
    default:
      return null;
  }
  return Math.round(base * markup);
}

export function sellPrice(item, level, playerLevel, goldBonus = 1) {
  let base;
  switch (item.kind) {
    case "gear":
      base = 20 * (1 + (level || 0)) * (item.rarity === "boss" ? 2 : 1);
      break;
    case "upgrade":
      base = 150;
      break;
    default:
      base = (buyPrice(item, playerLevel) || 0) * BALANCE.sellRatio;
  }
  return Math.max(1, Math.round(base * goldBonus));
}

export function upgradeCost(item, level, forgeDiscount = 0) {
  if (level >= MAX_GEAR_LEVEL) {
    return null;
  }
  const rarityFactor = item.rarity === "boss" ? 2 : 1;
  return Math.round(BALANCE.upgradeCost * (level + 1) * rarityFactor * (1 - forgeDiscount));
}

export function innPrice(playerLevel) {
  return 4 + 6 * playerLevel;
}

export { MAX_FLOOR };
