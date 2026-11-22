import assert from "node:assert/strict";
import { test } from "node:test";

import { createNewGame } from "../src/core/state.js";
import { createStorage } from "../src/core/storage.js";
import { countItem } from "../src/game/items.js";
import { BALANCE, getPlayerStats, innPrice } from "../src/game/rules.js";
import { getDestinations, getFloorStatus, getShop, isInCity } from "../src/game/selectors.js";
import { createSession, playUntil, recklessTurn } from "./helpers/bot.js";

/** Sesión con un personaje lo bastante fuerte para ganar cualquier combate temprano. */
function strongSession(overrides = {}) {
  const state = createNewGame({ name: "Fuerte", seed: "fuerte" });
  state.player = { ...state.player, level: 30, maxHp: 680, hp: 680, ...overrides.player };
  state.inventory.gold = overrides.gold ?? 0;
  return createSession({ state, rngSeed: "tiradas" });
}

function winFight({ engine, game }) {
  for (let turn = 0; turn < 200 && engine.getState().combat; turn += 1) {
    game.act({ type: "attack" });
  }
  assert.equal(engine.getState().combat, null);
}

function clearFloor(session) {
  const { engine, game } = session;
  for (;;) {
    const status = getFloorStatus(engine.getState());
    if (status.cleared < status.total) {
      assert.ok(game.explore().ok);
    } else if (status.bossReady) {
      assert.ok(game.challengeBoss().ok);
    } else {
      return;
    }
    winFight(session);
  }
}

test("al empezar se entrega el equipo inicial una sola vez", () => {
  const { engine, game } = createSession();
  const { items } = engine.getState().inventory;
  assert.equal(countItem(items, "pocion-menor"), 1);
  assert.equal(countItem(items, "hierbas"), 2);
  assert.equal(countItem(items, "cuerda"), 1);
  game.start();
  assert.equal(countItem(engine.getState().inventory.items, "cuerda"), 1);
  assert.ok(isInCity(engine.getState()));
});

test("no se puede explorar ni subir sin cumplir las condiciones", () => {
  const { engine, game } = createSession();
  assert.equal(game.explore().ok, false, "en la ciudad no hay nada que explorar");
  assert.equal(game.ascend().ok, false);
  assert.equal(game.act({ type: "attack" }).ok, false);
  assert.equal(game.enterCastle("refugio-11").ok, false, "refugio aún no descubierto");

  assert.ok(game.enterCastle("entrada").ok);
  assert.equal(engine.getState().player.floor, 1);
  assert.equal(game.ascend().ok, false, "quedan enemigos");
  assert.equal(game.rest("inn").ok, false, "la posada está en Rubi");
  assert.equal(game.forge("weapon").ok, false);

  assert.ok(game.explore().ok);
  assert.ok(engine.getState().combat);
  assert.equal(game.explore().ok, false, "ya hay un combate en marcha");
  assert.equal(game.returnToCity("retreat").ok, false);
  assert.equal(game.buy("pocion-menor").ok, false);
});

test("ganar un combate da experiencia, oro y botín, y despeja el encuentro", () => {
  const session = strongSession();
  const { engine, game } = session;
  game.enterCastle("entrada");
  const before = engine.getState();
  game.explore();
  const rewards = engine.getState().combat.rewards;
  winFight(session);

  const after = engine.getState();
  assert.equal(after.run.cleared, 1);
  assert.equal(after.stats.battles, 1);
  assert.ok(after.inventory.gold > before.inventory.gold);
  assert.ok(after.player.xp > before.player.xp);
  const lootId = rewards.loot[0].id;
  const owned =
    countItem(after.inventory.items, lootId) +
    Object.values(after.equipment).filter((piece) => piece?.id === lootId).length;
  assert.ok(owned > countItem(before.inventory.items, lootId));
});

test("despejar el piso abre la escalera y subir genera un piso nuevo", () => {
  const session = strongSession();
  const { engine, game } = session;
  game.enterCastle("entrada");
  clearFloor(session);

  assert.ok(getFloorStatus(engine.getState()).canAscend);
  assert.ok(game.ascend().ok);
  const state = engine.getState();
  assert.equal(state.player.floor, 2);
  assert.equal(state.run.cleared, 0);
  assert.deepEqual(state.progress.floorsCleared, [1]);
  assert.equal(state.progress.maxFloor, 2);
});

test("subir de nivel restaura la salud y da un punto de habilidad", () => {
  const session = createSession({ seed: "nivel", rngSeed: "nivel" });
  const { engine } = session;
  const result = playUntil(session, { maxSteps: 400, stopAtFloor: 3 });
  const { player } = engine.getState();

  assert.equal(result.outcome, "piso");
  assert.ok(player.level >= 2);
  assert.equal(player.maxHp, 100 + 20 * (player.level - 1));
  const spent = Object.values(engine.getState().skills)
    .flatMap((group) => Object.values(group))
    .reduce((total, rank) => total + rank, 0);
  assert.equal(spent + player.skillPoints, player.level, "un punto inicial más uno por nivel");
});

test("la cuerda guarda el punto de regreso y el refugio permite viajar", () => {
  const session = strongSession();
  const { engine, game } = session;
  game.enterCastle("entrada");
  game.explore();
  winFight(session);
  const run = engine.getState().run;

  assert.ok(game.returnToCity("rope").ok);
  assert.ok(isInCity(engine.getState()));
  assert.equal(countItem(engine.getState().inventory.items, "cuerda"), 0);
  assert.deepEqual(engine.getState().progress.anchor, run);
  assert.equal(game.returnToCity("rope").ok, false, "ya está en Rubi");

  assert.ok(game.enterCastle("cuerda").ok);
  assert.deepEqual(engine.getState().run, run);
  assert.equal(engine.getState().progress.anchor, null);
  assert.equal(game.returnToCity("rope").ok, false, "no quedan cuerdas");
  assert.equal(game.returnToCity("travel").ok, false, "no es un refugio");

  assert.ok(game.returnToCity("retreat").ok);
  assert.deepEqual(
    getDestinations(engine.getState()).map((destination) => destination.id),
    ["entrada"]
  );
});

test("un refugio descubierto queda como destino y permite descansar gratis", () => {
  const state = createNewGame({ seed: "refugio" });
  state.player = { ...state.player, level: 40, maxHp: 880, hp: 880, floor: 10 };
  state.progress.bossesDefeated = ["guardian-del-bosque"];
  state.run = { floor: 10, expedition: 1, cleared: 0, eventUsed: false };
  const session = createSession({ state });
  const { engine, game } = session;

  clearFloor(session);
  assert.ok(game.ascend().ok);
  assert.equal(engine.getState().player.floor, 11);
  assert.ok(getFloorStatus(engine.getState()).plan.safe);
  assert.deepEqual(engine.getState().progress.refuges, [11]);

  engine.apply("updatePlayer", { hp: 10, energy: 0 });
  assert.ok(game.rest("camp").ok);
  assert.equal(engine.getState().player.hp, 880);
  assert.equal(engine.getState().player.energy, BALANCE.maxEnergy);

  assert.ok(game.returnToCity("travel").ok);
  assert.ok(game.enterCastle("refugio-11").ok);
  assert.equal(engine.getState().player.floor, 11);
  assert.ok(game.ascend().ok, "un refugio no tiene enemigos que bloqueen la escalera");
});

test("vencer a un jefe da su botín y no hay que repetirlo", () => {
  const state = createNewGame({ seed: "jefe" });
  state.player = { ...state.player, level: 40, maxHp: 880, hp: 880, floor: 10 };
  state.run = { floor: 10, expedition: 1, cleared: 0, eventUsed: false };
  const session = createSession({ state });
  const { engine, game } = session;

  assert.equal(game.challengeBoss().ok, false, "antes hay que despejar el piso");
  clearFloor(session);
  const after = engine.getState();
  assert.deepEqual(after.progress.bossesDefeated, ["guardian-del-bosque"]);
  assert.equal(after.stats.bosses, 1);
  assert.equal(after.equipment.head.id, "corona-oscura");
  assert.equal(countItem(after.inventory.items, "nucleo-elemental"), 1);

  const coreUse = game.useItem("nucleo-elemental", "head");
  assert.ok(coreUse.ok);
  assert.equal(engine.getState().equipment.head.level, after.equipment.head.level + 2);
  assert.equal(game.useItem("nucleo-elemental", "head").ok, false);

  game.returnToCity("retreat");
  game.enterCastle("entrada");
  assert.equal(getFloorStatus(engine.getState()).bossPending, false);
});

test("caer en combate devuelve a Rubi con la mitad del oro", () => {
  const session = createSession({ seed: "derrota" });
  const { engine, game } = session;
  engine.apply("updateInventory", { gold: 101 });
  game.enterCastle("entrada");
  engine.apply("updatePlayer", { hp: 1 });
  game.explore();
  for (let turn = 0; turn < 50 && engine.getState().combat; turn += 1) {
    game.act({ type: "defend" });
  }

  const state = engine.getState();
  assert.ok(state.flags.defeat);
  assert.equal(state.flags.defeat.floor, 1);
  assert.equal(state.flags.defeat.goldLost, 50);
  assert.equal(state.inventory.gold, 51);
  assert.equal(state.player.floor, 0);
  assert.equal(state.run, null);
  assert.equal(state.combat, null);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.stats.deaths, 1);
  assert.equal(countItem(state.inventory.items, "cuerda"), 1, "los objetos se conservan");

  assert.equal(game.enterCastle("entrada").ok, false, "antes hay que cerrar el resumen");
  assert.ok(game.acknowledge("defeat").ok);
  assert.ok(game.enterCastle("entrada").ok);
});

test("la tienda, la posada y la herrería cobran lo que anuncian", () => {
  const { engine, game } = strongSession({ gold: 1000, player: { hp: 100 } });
  const level = engine.getState().player.level;

  const potion = getShop(engine.getState()).stock.find((offer) => offer.item.id === "pocion-menor");
  assert.ok(game.buy("pocion-menor").ok);
  assert.equal(engine.getState().inventory.gold, 1000 - potion.price);
  assert.equal(countItem(engine.getState().inventory.items, "pocion-menor"), 2);

  assert.ok(game.sell("hierbas").ok);
  assert.equal(countItem(engine.getState().inventory.items, "hierbas"), 1);
  assert.ok(engine.getState().inventory.gold > 1000 - potion.price);
  assert.equal(game.sell("no-existe").ok, false);

  const beforeInn = engine.getState().inventory.gold;
  assert.ok(game.rest("inn").ok);
  assert.equal(engine.getState().inventory.gold, beforeInn - innPrice(level));
  assert.equal(engine.getState().player.hp, 680);
  assert.equal(game.rest("inn").ok, false, "ya está en plena forma");

  assert.ok(game.forge("weapon").ok, "forja una espada");
  assert.deepEqual(engine.getState().equipment.weapon, { id: "espada-antigua", level: 0 });
  const attack = getPlayerStats(engine.getState()).attack;
  assert.ok(game.forge("weapon").ok, "la mejora");
  assert.equal(engine.getState().equipment.weapon.level, 1);
  assert.equal(getPlayerStats(engine.getState()).attack, attack + 5);
  assert.equal(game.forge("head").ok, false, "la corona solo la dan los jefes");

  engine.apply("updateInventory", { gold: 0 });
  assert.equal(game.buy("pocion-menor").ok, false);
  assert.equal(game.forge("weapon").ok, false);
});

test("equipar, quitar y usar objetos mueve las piezas entre equipo y mochila", () => {
  const { engine, game } = strongSession({ gold: 500, player: { hp: 100 } });
  game.forge("weapon");
  assert.ok(game.unequip("weapon").ok);
  assert.equal(engine.getState().equipment.weapon, null);
  assert.equal(countItem(engine.getState().inventory.items, "espada-antigua"), 1);
  assert.equal(game.unequip("weapon").ok, false);

  assert.ok(game.equip("espada-antigua+0").ok);
  assert.equal(countItem(engine.getState().inventory.items, "espada-antigua"), 0);
  assert.equal(game.equip("hierbas").ok, false);

  assert.ok(game.useItem("pocion-menor").ok);
  assert.equal(engine.getState().player.hp, 100 + Math.round(680 * 0.2));
  assert.equal(countItem(engine.getState().inventory.items, "pocion-menor"), 0);
  engine.apply("updatePlayer", { hp: 680 });
  assert.equal(game.useItem("hierbas").ok, false, "con la salud llena no se gasta");
});

test("las habilidades cuestan un punto y tienen rango máximo", () => {
  const { engine, game } = createSession();
  assert.ok(game.learnSkill("golpe").ok);
  assert.equal(engine.getState().skills.weapons.golpe, 1);
  assert.equal(engine.getState().player.skillPoints, 0);
  assert.equal(game.learnSkill("golpe").ok, false, "sin puntos");
  assert.equal(game.learnSkill("inventada").ok, false);

  engine.apply("updatePlayer", { skillPoints: 10 });
  for (let rank = 2; rank <= 5; rank += 1) {
    assert.ok(game.learnSkill("golpe").ok);
  }
  assert.equal(game.learnSkill("golpe").ok, false, "rango máximo");
  assert.ok(game.learnSkill("alquimia").ok);
  assert.equal(engine.getState().skills.craft.alquimia, 1);
});

test("con todas las habilidades al máximo ya no se reparten puntos", () => {
  const state = createNewGame({ seed: "maestro" });
  state.player = { ...state.player, level: 30, maxHp: 680, hp: 680, skillPoints: 1, xp: 0 };
  state.skills = {
    weapons: { golpe: 5, barrido: 5, aliento: 5, maestria: 5, guardia: 5 },
    craft: { alquimia: 5, forja: 5, comercio: 4 },
  };
  const session = createSession({ state, rngSeed: "maestro" });
  const { engine, game } = session;
  engine.apply("updatePlayer", { xp: 939 });
  game.enterCastle("entrada");
  game.explore();
  winFight(session);

  assert.equal(engine.getState().player.level, 31);
  assert.equal(engine.getState().player.skillPoints, 1, "solo queda un rango por aprender");
  assert.ok(game.learnSkill("comercio").ok);
  assert.equal(game.learnSkill("comercio").ok, false);
});

test("una partida guardada en mitad de un combate se puede continuar", () => {
  const data = new Map();
  const storage = createStorage({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  });
  const first = createSession({ seed: "guardado", rngSeed: "a" });
  first.game.learnSkill("golpe");
  first.game.enterCastle("entrada");
  first.game.explore();
  first.game.act({ type: "attack" });
  storage.save(first.engine.getState());

  const loaded = storage.load();
  assert.deepEqual(loaded, first.engine.getState());
  const second = createSession({ state: loaded, rngSeed: "b" });
  assert.ok(second.engine.getState().combat);
  assert.equal(countItem(second.engine.getState().inventory.items, "cuerda"), 1, "no repite el equipo inicial");
  assert.ok(second.game.act({ type: "skill", id: "golpe" }).ok);
  assert.equal(second.engine.getState().player.energy <= BALANCE.maxEnergy, true);
});

test("un jugador temerario cae antes del piso 20", () => {
  for (const seed of ["a", "b", "c"]) {
    const session = createSession({ seed, rngSeed: seed });
    const result = playUntil(session, { turn: recklessTurn, maxDeaths: 1, maxSteps: 5000 });
    assert.equal(result.outcome, "derrota", seed);
    assert.ok(result.memory.deathFloors[0] < 20, `cae en el piso ${result.memory.deathFloors[0]}`);
    assert.ok(result.memory.deathFloors[0] >= 3, "los primeros pisos son asequibles");
  }
});

test("un jugador prudente completa los 100 pisos y gana la partida", () => {
  const session = createSession({ seed: "victoria", rngSeed: "victoria" });
  const result = playUntil(session, { maxSteps: 20000 });
  const { state } = result;

  assert.equal(result.outcome, "victoria");
  assert.ok(state.flags.victory);
  assert.equal(state.progress.maxFloor, 100);
  assert.equal(state.progress.bossesDefeated.length, 5);
  assert.deepEqual(state.progress.refuges, [11, 21, 31, 41, 51, 61, 71, 81, 91]);
  assert.ok(isInCity(state), "tras la victoria vuelve a Rubi");
  assert.ok(state.stats.deaths <= 5, `demasiadas derrotas: ${state.stats.deaths}`);
  assert.ok(state.player.level >= 40 && state.player.level <= 70, `nivel ${state.player.level}`);

  assert.ok(session.game.acknowledge("victoryPending").ok);
  assert.ok(session.game.enterCastle("refugio-91").ok, "se puede seguir jugando");
});
