export const SAVE_VERSION = 1;

const DEFAULT_NAME = "Aventurero";
const GENDERS = new Set(["femenino", "masculino", "indefinido"]);

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // randomUUID solo existe en contextos seguros (HTTPS o localhost).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createNewGame({ name, gender, seed } = {}) {
  const safeName = (name || DEFAULT_NAME).trim().slice(0, 24) || DEFAULT_NAME;
  const safeGender = GENDERS.has(gender) ? gender : "indefinido";
  const safeSeed = String(seed ?? "").trim().slice(0, 40);
  const now = new Date().toISOString();

  return {
    meta: {
      version: SAVE_VERSION,
      createdAt: now,
      updatedAt: now,
      seed: safeSeed || Date.now().toString(36),
    },
    player: {
      id: createId(),
      name: safeName,
      gender: safeGender,
      level: 1,
      xp: 0,
      hp: 100,
      maxHp: 100,
      energy: 5,
      skillPoints: 1,
      floor: 0,
    },
    progress: {
      floorsCleared: [],
      lastCity: "Rubi",
      maxFloor: 0,
      refuges: [],
      bossesDefeated: [],
      anchor: null,
      expeditions: 0,
    },
    inventory: {
      gold: 0,
      items: [],
    },
    equipment: {
      weapon: null,
      charm: null,
      head: null,
    },
    skills: {
      weapons: {},
      craft: {},
    },
    stats: {
      battles: 0,
      kills: 0,
      bosses: 0,
      deaths: 0,
      fled: 0,
      turns: 0,
      goldEarned: 0,
    },
    flags: {},
    run: null,
    combat: null,
    log: [
      "Has llegado a la ciudad de Rubi.",
      "El castillo se alza con 100 pisos por delante.",
    ],
  };
}

export function touchState(state) {
  return {
    ...state,
    meta: {
      ...state.meta,
      updatedAt: new Date().toISOString(),
    },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value, fallback, min = -Infinity) {
  return Number.isFinite(value) ? Math.max(min, value) : fallback;
}

/**
 * Valida una partida leída del almacenamiento y completa los campos que le
 * falten con los valores de una partida nueva. Devuelve null si los datos no
 * son una partida reconocible o son de una versión posterior.
 */
export function normalizeState(data) {
  if (!isPlainObject(data) || !isPlainObject(data.meta) || !isPlainObject(data.player)) {
    return null;
  }
  if (!Number.isInteger(data.meta.version) || data.meta.version > SAVE_VERSION) {
    return null;
  }

  const base = createNewGame({
    name: typeof data.player.name === "string" ? data.player.name : "",
    gender: data.player.gender,
    seed: data.meta.seed,
  });
  const merge = (key) => ({
    ...base[key],
    ...(isPlainObject(data[key]) ? data[key] : {}),
  });

  const state = {
    ...base,
    meta: { ...merge("meta"), version: SAVE_VERSION, seed: base.meta.seed },
    player: { ...merge("player"), name: base.player.name, gender: base.player.gender },
    progress: merge("progress"),
    inventory: merge("inventory"),
    equipment: merge("equipment"),
    skills: {
      weapons: isPlainObject(data.skills?.weapons) ? { ...data.skills.weapons } : {},
      craft: isPlainObject(data.skills?.craft) ? { ...data.skills.craft } : {},
    },
    stats: merge("stats"),
    flags: isPlainObject(data.flags) ? { ...data.flags } : {},
    run: isPlainObject(data.run) ? data.run : null,
    combat: isPlainObject(data.combat) ? data.combat : null,
    log: Array.isArray(data.log) ? data.log.slice(0, 50) : base.log,
  };

  const player = state.player;
  player.level = Math.floor(finiteNumber(player.level, 1, 1));
  player.xp = finiteNumber(player.xp, 0, 0);
  player.maxHp = finiteNumber(player.maxHp, 100, 1);
  player.hp = Math.min(player.maxHp, finiteNumber(player.hp, player.maxHp, 0));
  player.energy = finiteNumber(player.energy, 0, 0);
  player.skillPoints = Math.floor(finiteNumber(player.skillPoints, 0, 0));
  player.floor = Math.floor(finiteNumber(player.floor, 0, 0));
  state.inventory.gold = Math.floor(finiteNumber(state.inventory.gold, 0, 0));
  if (!Array.isArray(state.inventory.items)) {
    state.inventory.items = [];
  }
  for (const key of ["floorsCleared", "refuges", "bossesDefeated"]) {
    if (!Array.isArray(state.progress[key])) {
      state.progress[key] = [];
    }
  }

  // Un piso sin expedición (o al revés) dejaría la partida en un estado sin
  // salida, así que se devuelve al jugador a la ciudad.
  if ((player.floor > 0 && !state.run) || (player.floor === 0 && state.run)) {
    player.floor = 0;
    state.run = null;
    state.combat = null;
  }
  if (state.combat && !Array.isArray(state.combat.enemies)) {
    state.combat = null;
  }

  return state;
}
