import { getSkill } from "../game/skills.js";

/**
 * Tiempos de enfriamiento de los botones, en milisegundos. Marcan el ritmo de
 * la partida y evitan encadenar pulsaciones por error; la navegación (pestañas,
 * tienda, ajustes) no tiene enfriamiento.
 */
export const COOLDOWN = {
  // Pausa mínima entre dos acciones de combate, sea cual sea el botón.
  round: 450,
  // Al llegar a una pantalla sus botones empiezan enfriándose, como mucho esto.
  arrival: 1000,
  // Tiempo que se sigue viendo el combate tras el último golpe.
  outro: 600,
  combat: {
    attack: 600,
    defend: 600,
    item: 1200,
    flee: 1500,
  },
  // Las técnicas tardan más cuanta más energía cuestan.
  skill: { base: 1000, perEnergy: 500 },
  actions: {
    explore: 800,
    boss: 1500,
    ascend: 800,
    enter: 1000,
    return: 1500,
    rest: 2000,
    pray: 2000,
    use: 800,
    forge: 800,
    learn: 400,
    buy: 300,
    sell: 300,
    equip: 300,
    unequip: 300,
    "ack-defeat": 1000,
    "ack-victory": 1000,
  },
};

const COMBAT_GROUP = "grupo:combate";

/** Duración del enfriamiento de un botón a partir de sus atributos data-*. */
export function cooldownMs(data) {
  if (!data) {
    return 0;
  }
  if (data.action === "act") {
    if (data.type === "skill") {
      const skill = getSkill(data.id);
      return COOLDOWN.skill.base + COOLDOWN.skill.perEnergy * (skill?.cost || 0);
    }
    return COOLDOWN.combat[data.type] || 0;
  }
  return COOLDOWN.actions[data.action] || 0;
}

/** Identidad del botón: dos botones con la misma clave comparten enfriamiento. */
export function cooldownKey(data) {
  if (cooldownMs(data) <= 0) {
    return null;
  }
  return [data.action, data.type, data.id, data.key, data.slot, data.kind, data.mode]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("|");
}

/** Grupo con el que el botón comparte una pausa común, si lo tiene. */
export function cooldownGroup(data) {
  return data?.action === "act" ? COMBAT_GROUP : null;
}

/** Registro de enfriamientos en curso. `now` devuelve milisegundos. */
export function createCooldowns(now) {
  const active = new Map();

  function start(key, ms, at = now()) {
    if (!key || !(ms > 0)) {
      return;
    }
    const current = active.get(key);
    // Un enfriamiento nunca acorta otro que ya está en marcha.
    if (current && current.end >= at + ms) {
      return;
    }
    active.set(key, { start: at, end: at + ms });
  }

  function read(key, at) {
    const entry = active.get(key);
    if (!entry) {
      return null;
    }
    if (entry.end <= at) {
      active.delete(key);
      return null;
    }
    return entry;
  }

  return {
    start,

    /** Empieza el enfriamiento del botón pulsado y la pausa común de su grupo. */
    press(data, at = now()) {
      start(cooldownKey(data), cooldownMs(data), at);
      if (cooldownGroup(data)) {
        start(cooldownGroup(data), COOLDOWN.round, at);
      }
    },

    /** Enfriamiento inicial de un botón recién aparecido en pantalla. */
    arrive(data, at = now()) {
      start(cooldownKey(data), Math.min(cooldownMs(data), COOLDOWN.arrival), at);
    },

    /** Estado del botón: null si está listo; si no, tiempos total, pasado y restante. */
    get(data, at = now()) {
      const entries = [read(cooldownKey(data), at), read(cooldownGroup(data), at)].filter(Boolean);
      if (entries.length === 0) {
        return null;
      }
      const entry = entries.reduce((longest, item) => (item.end > longest.end ? item : longest));
      return { total: entry.end - entry.start, elapsed: at - entry.start, remaining: entry.end - at };
    },

    /** Milisegundos hasta que termine el próximo enfriamiento, o null si no hay ninguno. */
    next(at = now()) {
      let soonest = null;
      for (const [key, entry] of active) {
        if (entry.end <= at) {
          active.delete(key);
        } else if (soonest === null || entry.end - at < soonest) {
          soonest = entry.end - at;
        }
      }
      return soonest;
    },

    clear() {
      active.clear();
    },
  };
}
