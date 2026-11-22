import { LOOT_TABLES } from "../content/items.js";
import { getItem } from "./items.js";
import {
  BALANCE,
  bossStats,
  computeDamage,
  dropLevel,
  enemyStats,
  goldTagBonus,
  powerMultiplier,
} from "./rules.js";
import { getEffect, getRank, getSkill, isTechnique } from "./skills.js";

function lootEntry(id, floor) {
  const item = getItem(id);
  return item?.kind === "gear" ? { id, level: dropLevel(floor) } : { id };
}

/** Combate contra un encuentro generado por procgen (un tipo de enemigo, de 1 a 3). */
export function createEncounterCombat({
  encounter,
  floor,
  difficulty,
  powerMod = 1,
  rewardMod = 1,
  goldMod = 1,
}) {
  const { enemy, count } = encounter;
  const power = enemy.power * powerMultiplier(floor) * powerMod;
  const stats = enemyStats(power, enemy.tags, count, difficulty);
  const threat = power * count;

  return {
    kind: "encounter",
    floor,
    title: count > 1 ? `${enemy.name} ×${count}` : enemy.name,
    threat: Math.round(threat),
    round: 1,
    bossStep: 0,
    feed: [],
    enemies: Array.from({ length: count }, (_, index) => ({
      id: enemy.id,
      name: count > 1 ? `${enemy.name} ${index + 1}` : enemy.name,
      tags: enemy.tags || [],
      hp: stats.maxHp,
      ...stats,
    })),
    rewards: {
      xp: Math.round(threat * rewardMod),
      gold: threat * rewardMod * goldMod * goldTagBonus(enemy.tags),
      loot: encounter.loot ? [lootEntry(encounter.loot.id, floor)] : [],
    },
  };
}

/** Combate contra el jefe del piso: un único enemigo con ciclo de golpe devastador. */
export function createBossCombat({ boss, floor, difficulty }) {
  const stats = bossStats(boss.power, difficulty);

  return {
    kind: "boss",
    floor,
    bossId: boss.id,
    title: boss.name,
    threat: boss.power,
    round: 1,
    bossStep: 0,
    feed: [],
    enemies: [{ id: boss.id, name: boss.name, tags: [], hp: stats.maxHp, ...stats }],
    rewards: {
      xp: boss.power * BALANCE.boss.xpPerPower,
      gold: boss.power * BALANCE.boss.goldPerPower,
      loot: LOOT_TABLES.boss.map((item) => lootEntry(item.id, floor)),
    },
  };
}

function nextBossStep(combat) {
  const { pattern } = BALANCE.boss;
  return pattern[combat.bossStep % pattern.length];
}

/** Verdadero si el próximo movimiento del jefe es el golpe devastador. */
export function isBlastIncoming(combat) {
  return combat?.kind === "boss" && nextBossStep(combat) === "blast";
}

const invalid = (reason) => ({ ok: false, reason });

/**
 * Resuelve una ronda: la acción del jugador y, si el combate sigue, el turno
 * de los enemigos. Función pura: no modifica sus argumentos.
 *
 * Acciones: { type: "attack" | "defend" | "flee" }, { type: "skill", id } y
 * { type: "item", name, heal } con la curación ya calculada en puntos.
 */
export function resolveRound({ combat, hp, energy, stats, skills, action, rng }) {
  const enemies = combat.enemies.map((enemy) => ({ ...enemy }));
  const alive = () => enemies.filter((enemy) => enemy.hp > 0);
  const events = [];
  const say = (text, tone = "info") => events.push({ text, tone });
  let bossStep = combat.bossStep;
  let defending = false;
  let kills = 0;

  const done = (outcome) => ({
    ok: true,
    outcome,
    hp,
    energy,
    events,
    kills,
    combat: { ...combat, enemies, bossStep, round: combat.round + 1, feed: events },
  });

  const strike = (target, multiplier, verb) => {
    const crit = rng() < stats.critChance;
    const damage = computeDamage(
      stats.attack,
      target.defense,
      rng(),
      multiplier * (crit ? stats.critMultiplier : 1)
    );
    target.hp = Math.max(0, target.hp - damage);
    say(
      `${verb} a ${target.name}: ${damage} de daño${crit ? " (¡crítico!)" : ""}.`,
      crit ? "crit" : "hit"
    );
    if (target.hp === 0) {
      kills += 1;
      energy = Math.min(BALANCE.maxEnergy, energy + 1);
      say(`${target.name} cae. +1 de energía.`, "kill");
    }
  };

  switch (action?.type) {
    case "attack":
      strike(alive()[0], 1, "Atacas");
      break;
    case "defend":
      defending = true;
      say("Te pones en guardia.", "info");
      break;
    case "skill": {
      const skill = getSkill(action.id);
      if (!isTechnique(skill) || getRank(skills, skill.id) < 1) {
        return invalid("No conoces esa técnica.");
      }
      if (energy < skill.cost) {
        return invalid("No tienes energía suficiente.");
      }
      const effect = getEffect(skills, skill.id);
      if (skill.id === "aliento") {
        if (hp >= stats.maxHp) {
          return invalid("Ya tienes la salud al máximo.");
        }
        const healed = Math.min(stats.maxHp - hp, Math.round(stats.maxHp * effect.heal));
        hp += healed;
        energy -= skill.cost;
        say(`Segundo aliento: recuperas ${healed} de salud.`, "heal");
      } else {
        // Se paga antes de golpear para que la energía de las bajas no se pierda por el tope.
        energy -= skill.cost;
        if (skill.id === "barrido") {
          alive().forEach((target) => strike(target, effect.multiplier, "Barres"));
        } else {
          strike(alive()[0], effect.multiplier, "Golpe poderoso");
        }
      }
      break;
    }
    case "item": {
      if (hp >= stats.maxHp) {
        return invalid("Ya tienes la salud al máximo.");
      }
      const healed = Math.min(stats.maxHp - hp, action.heal);
      hp += healed;
      say(`Usas ${action.name}: recuperas ${healed} de salud.`, "heal");
      break;
    }
    case "flee":
      if (combat.kind === "boss") {
        return invalid("No puedes huir de un jefe.");
      }
      if (rng() < BALANCE.fleeChance) {
        say("Consigues escapar.", "info");
        return done("fled");
      }
      say("Intentas huir, pero te cortan el paso.", "warn");
      break;
    default:
      return invalid("Acción desconocida.");
  }

  if (alive().length === 0) {
    return done("victory");
  }

  for (const enemy of alive()) {
    let multiplier = 1;
    let blast = false;
    if (combat.kind === "boss") {
      const step = nextBossStep({ bossStep });
      bossStep += 1;
      if (step === "charge") {
        say(`${enemy.name} toma impulso: prepara un golpe devastador.`, "warn");
        continue;
      }
      if (step === "blast") {
        blast = true;
        multiplier = BALANCE.boss.blastMultiplier;
      }
    }
    if (!blast && rng() < BALANCE.enemy.missChance) {
      say(`${enemy.name} falla su ataque.`, "miss");
      continue;
    }
    if (defending) {
      multiplier *= 1 - stats.block;
    }
    const damage = computeDamage(enemy.attack, stats.defense, rng(), multiplier);
    hp = Math.max(0, hp - damage);
    const how = blast ? "descarga su golpe devastador" : "te ataca";
    say(
      `${enemy.name} ${how}: ${damage} de daño${defending ? " (bloqueado en parte)" : ""}.`,
      "hurt"
    );
    if (blast && defending && hp > 0) {
      energy = Math.min(BALANCE.maxEnergy, energy + 1);
      say("Aguantas el golpe devastador. +1 de energía.", "info");
    }
    if (hp === 0) {
      return done("defeat");
    }
  }

  return done("ongoing");
}
