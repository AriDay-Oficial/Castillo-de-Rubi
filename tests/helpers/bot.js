import { createEngine } from "../../src/core/engine.js";
import { createEventBus } from "../../src/core/events.js";
import { createNewGame } from "../../src/core/state.js";
import { createBossCombat, isBlastIncoming } from "../../src/game/combat.js";
import { createGame } from "../../src/game/game.js";
import { entryKey, getItem } from "../../src/game/items.js";
import { BALANCE, estimateDanger, getPlayerStats, innPrice } from "../../src/game/rules.js";
import {
  getDestinations,
  getFloorStatus,
  getForgeOptions,
  getHealItems,
  getRopeCount,
  getShop,
  isInCity,
} from "../../src/game/selectors.js";
import { getRank, getSkill, SKILL_MAX_RANK } from "../../src/game/skills.js";
import { createRng } from "../../src/procgen/random.js";

export function createSession({ seed = "prueba", rngSeed = "tiradas", name = "Bot", state } = {}) {
  const bus = createEventBus();
  const engine = createEngine(state || createNewGame({ name, seed }), bus);
  const game = createGame({ engine, bus, rng: createRng(rngSeed) });
  game.start();
  return { bus, engine, game };
}

const SKILL_PRIORITY = ["golpe", "aliento", "barrido", "maestria", "guardia", "forja", "alquimia", "comercio"];

function spendSkillPoints({ engine, game }) {
  while (engine.getState().player.skillPoints > 0) {
    const { skills } = engine.getState();
    const next = SKILL_PRIORITY.filter((id) => getRank(skills, id) < SKILL_MAX_RANK).sort(
      (a, b) => getRank(skills, a) - getRank(skills, b)
    )[0];
    if (!next || !game.learnSkill(next).ok) {
      return;
    }
  }
}

function useCores({ engine, game }) {
  for (;;) {
    const state = engine.getState();
    const core = state.inventory.items.find((entry) => getItem(entry.id)?.kind === "upgrade");
    const slots = Object.entries(state.equipment)
      .filter(([, piece]) => piece)
      .sort(([, a], [, b]) => a.level - b.level);
    if (!core || slots.length === 0 || !game.useItem(entryKey(core), slots[0][0]).ok) {
      return;
    }
  }
}

function healUpTo(session, ratio) {
  const { engine, game } = session;
  for (;;) {
    const state = engine.getState();
    const heals = getHealItems(state);
    if (state.player.hp >= state.player.maxHp * ratio || heals.length === 0) {
      return;
    }
    if (!game.useItem(entryKey(heals[heals.length - 1].entry)).ok) {
      return;
    }
  }
}

function countHeals(state) {
  return getHealItems(state).reduce((total, { entry }) => total + entry.qty, 0);
}

function cityTurn(session, memory) {
  const { engine, game } = session;
  const sellGear = () => {
    for (const entry of engine.getState().inventory.items) {
      if (getItem(entry.id)?.kind === "gear") {
        for (let count = entry.qty; count > 0; count -= 1) {
          game.sell(entryKey(entry));
        }
      }
    }
  };
  const buyUpTo = (itemId, wanted, counter) => {
    while (counter(engine.getState()) < wanted && game.buy(itemId).ok) {
      // sigue comprando
    }
  };

  useCores(session);
  sellGear();
  const before = engine.getState();
  if (before.inventory.gold >= innPrice(before.player.level)) {
    game.rest("inn");
  } else {
    game.rest("free");
  }
  buyUpTo("cuerda", 1, getRopeCount);
  buyUpTo("pocion-menor", 2, countHeals);
  for (;;) {
    const options = getForgeOptions(engine.getState())
      .filter((option) => option.action && option.cost <= engine.getState().inventory.gold)
      .sort((a, b) => a.cost - b.cost);
    if (options.length === 0 || !game.forge(options[0].slot.id).ok) {
      break;
    }
  }
  buyUpTo("pocion-menor", 4, countHeals);

  const destinations = getDestinations(engine.getState());
  const best =
    destinations.find((destination) => destination.kind === "anchor") ||
    destinations.reduce((top, destination) => (destination.floor > top.floor ? destination : top));
  memory.cityVisitFloor = best.floor;
  game.enterCastle(best.id);
}

function cheapestUpgrade(state) {
  const costs = getForgeOptions(state)
    .filter((option) => option.action)
    .map((option) => option.cost);
  return costs.length ? Math.min(...costs) : Infinity;
}

function floorTurn(session, memory) {
  const { engine, game } = session;
  useCores(session);
  let state = engine.getState();
  const status = getFloorStatus(state);
  const { hp, maxHp } = state.player;
  const visitedCityHere = memory.cityVisitFloor === status.floor;

  if (status.plan.safe) {
    if (hp < maxHp || state.player.energy < BALANCE.maxEnergy) {
      game.rest("camp");
      return;
    }
    if (!visitedCityHere && state.inventory.gold >= cheapestUpgrade(state)) {
      game.returnToCity("travel");
      return;
    }
    game.ascend();
    return;
  }

  if (status.plan.eventId === "altar" && status.eventAvailable && hp < maxHp * 0.75) {
    game.pray();
    return;
  }
  if (getShop(state) && countHeals(state) < 3) {
    if (game.buy("pocion-menor").ok) {
      return;
    }
  }
  healUpTo(session, 0.55);
  state = engine.getState();
  const hasRope = getRopeCount(state) > 0;
  if (state.player.hp < maxHp * 0.45 && countHeals(state) === 0 && hasRope && !visitedCityHere) {
    game.returnToCity("rope");
    return;
  }
  if (
    !visitedCityHere &&
    getRopeCount(state) >= 2 &&
    state.inventory.gold >= 3 * cheapestUpgrade(state)
  ) {
    game.returnToCity("rope");
    return;
  }

  if (status.cleared < status.total) {
    game.explore();
    return;
  }
  if (status.bossReady) {
    healUpTo(session, 0.9);
    state = engine.getState();
    const preview = createBossCombat({
      boss: status.boss,
      floor: status.floor,
      difficulty: status.plan.zone.difficulty,
    });
    const danger = estimateDanger(getPlayerStats(state), state.player.hp, preview.enemies, true);
    if (danger.id === "extremo" && hasRope && !visitedCityHere) {
      game.returnToCity("rope");
      return;
    }
    memory.bossAttempts.push({
      floor: status.floor,
      level: state.player.level,
      danger: danger.id,
      ratio: danger.ratio,
    });
    game.challengeBoss();
    return;
  }
  if (status.canAscend) {
    game.ascend();
  }
}

function combatTurn({ engine, game }) {
  const state = engine.getState();
  const { combat, player, skills } = state;
  const ratio = player.hp / player.maxHp;
  const knows = (id) => getRank(skills, id) > 0 && player.energy >= getSkill(id).cost;
  const alive = combat.enemies.filter((enemy) => enemy.hp > 0).length;
  const heals = getHealItems(state);

  if (isBlastIncoming(combat)) {
    return game.act({ type: "defend" });
  }
  if (ratio < 0.35) {
    if (knows("aliento")) {
      return game.act({ type: "skill", id: "aliento" });
    }
    if (heals.length > 0) {
      return game.act({ type: "item", key: entryKey(heals[0].entry) });
    }
    if (combat.kind !== "boss" && ratio < 0.2) {
      return game.act({ type: "flee" });
    }
  }
  if (alive >= 2 && knows("barrido") && (ratio > 0.5 || player.energy >= BALANCE.maxEnergy)) {
    return game.act({ type: "skill", id: "barrido" });
  }
  if (knows("golpe") && (player.energy >= 4 || ratio > 0.6 || getRank(skills, "aliento") === 0)) {
    return game.act({ type: "skill", id: "golpe" });
  }
  return game.act({ type: "attack" });
}

/** Jugador automático prudente: usa la ciudad, la herrería, objetos y técnicas. */
export function prudentTurn(session, memory) {
  const state = session.engine.getState();
  spendSkillPoints(session);
  if (state.combat) {
    combatTurn(session);
  } else if (isInCity(state)) {
    cityTurn(session, memory);
  } else {
    floorTurn(session, memory);
  }
}

/** Jugador automático temerario: solo ataca y sube, sin ciudad ni habilidades. */
export function recklessTurn(session) {
  const { engine, game } = session;
  const state = engine.getState();
  if (state.combat) {
    const heals = getHealItems(state);
    if (state.player.hp < state.player.maxHp * 0.3 && heals.length > 0) {
      game.act({ type: "item", key: entryKey(heals[0].entry) });
    } else {
      game.act({ type: "attack" });
    }
    return;
  }
  if (isInCity(state)) {
    const destinations = getDestinations(state);
    game.enterCastle(destinations[destinations.length - 1].id);
    return;
  }
  const status = getFloorStatus(state);
  if (status.cleared < status.total) {
    game.explore();
  } else if (status.bossReady) {
    game.challengeBoss();
  } else if (status.plan.safe && state.player.hp < state.player.maxHp) {
    game.rest("camp");
  } else {
    game.ascend();
  }
}

/**
 * Juega hasta ganar, hasta `maxDeaths` derrotas o hasta agotar `maxSteps`.
 * Devuelve un resumen con el resultado y el estado final.
 */
export function playUntil(session, { turn = prudentTurn, maxSteps = 200000, maxDeaths = Infinity, stopAtFloor } = {}) {
  const { engine, game } = session;
  const memory = { cityVisitFloor: null, bossAttempts: [], deathFloors: [] };
  let steps = 0;
  let outcome = "agotado";

  while (steps < maxSteps) {
    const state = engine.getState();
    if (state.flags.victoryPending) {
      outcome = "victoria";
      break;
    }
    if (state.flags.defeat) {
      memory.deathFloors.push(state.flags.defeat.floor);
      memory.cityVisitFloor = null;
      game.acknowledge("defeat");
      if (memory.deathFloors.length >= maxDeaths) {
        outcome = "derrota";
        break;
      }
      continue;
    }
    if (stopAtFloor && state.player.floor >= stopAtFloor) {
      outcome = "piso";
      break;
    }
    const before = state;
    turn(session, memory);
    steps += 1;
    if (engine.getState() === before) {
      outcome = "atascado";
      break;
    }
  }

  return { outcome, steps, memory, state: engine.getState() };
}
