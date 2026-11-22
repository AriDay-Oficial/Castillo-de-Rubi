import assert from "node:assert/strict";
import { test } from "node:test";

import { createEngine } from "../src/core/engine.js";
import { createEventBus } from "../src/core/events.js";
import { createNewGame, normalizeState, SAVE_VERSION } from "../src/core/state.js";
import { createStorage, exportSave, importSave } from "../src/core/storage.js";

function memoryBackend() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

test("una partida nueva empieza en Rubi con valores seguros", () => {
  const state = createNewGame({ name: "   ", gender: "otro" });
  assert.equal(state.player.name, "Aventurero");
  assert.equal(state.player.gender, "indefinido");
  assert.equal(state.player.floor, 0);
  assert.equal(state.meta.version, SAVE_VERSION);
  assert.ok(state.meta.seed.length > 0);
  assert.equal(createNewGame({ name: "Ari", seed: " torre " }).meta.seed, "torre");
});

test("el motor aplica reductores, avisa de los cambios e ignora acciones desconocidas", () => {
  const bus = createEventBus();
  const engine = createEngine(createNewGame({ seed: "s" }), bus);
  let emitted = 0;
  bus.on("state:changed", () => {
    emitted += 1;
  });

  engine.apply("updatePlayer", { hp: 50 });
  engine.apply("log", "hola");
  assert.equal(engine.getState().player.hp, 50);
  assert.equal(engine.getState().log[0], "hola");
  assert.equal(emitted, 2);

  const before = engine.getState();
  engine.apply("noExiste", {});
  assert.equal(engine.getState(), before);
  assert.equal(emitted, 2);
});

test("batch agrupa varias acciones en un único aviso", () => {
  const bus = createEventBus();
  const engine = createEngine(createNewGame({ seed: "s" }), bus);
  let emitted = 0;
  bus.on("state:changed", () => {
    emitted += 1;
  });

  engine.batch(() => {
    engine.apply("updatePlayer", { hp: 10 });
    engine.apply("updateInventory", { gold: 99 });
    engine.batch(() => engine.apply("addStats", { battles: 2 }));
    assert.equal(emitted, 0);
  });
  assert.equal(emitted, 1);
  assert.equal(engine.getState().inventory.gold, 99);
  assert.equal(engine.getState().stats.battles, 2);
});

test("advanceFloor anota el piso superado y no pasa del piso 100", () => {
  const bus = createEventBus();
  const start = createNewGame({ seed: "s" });
  start.player.floor = 99;
  const engine = createEngine(start, bus);

  engine.apply("advanceFloor");
  assert.equal(engine.getState().player.floor, 100);
  assert.deepEqual(engine.getState().progress.floorsCleared, [99]);
  assert.equal(engine.getState().progress.maxFloor, 100);

  engine.apply("advanceFloor");
  assert.equal(engine.getState().player.floor, 100);
});

test("la bitácora conserva las 50 entradas más recientes", () => {
  const engine = createEngine(createNewGame({ seed: "s" }), createEventBus());
  for (let index = 0; index < 60; index += 1) {
    engine.apply("log", `entrada ${index}`);
  }
  assert.equal(engine.getState().log.length, 50);
  assert.equal(engine.getState().log[0], "entrada 59");
});

test("guardar y cargar devuelve la misma partida", () => {
  const backend = memoryBackend();
  const storage = createStorage(backend);
  assert.equal(storage.load(), null);

  const state = createNewGame({ name: "Ñandú", seed: "s" });
  state.inventory.gold = 321;
  state.equipment.weapon = { id: "espada-antigua", level: 2 };
  assert.equal(storage.save(state), true);
  assert.deepEqual(storage.load(), state);

  storage.clear();
  assert.equal(storage.load(), null);
});

test("los datos corruptos o de otra versión no se cargan", () => {
  const backend = memoryBackend();
  const storage = createStorage(backend, "clave");

  backend.setItem("clave", "{esto no es json");
  assert.equal(storage.load(), null);
  backend.setItem("clave", JSON.stringify({ hola: 1 }));
  assert.equal(storage.load(), null);

  const future = createNewGame({ seed: "s" });
  future.meta.version = SAVE_VERSION + 1;
  assert.equal(normalizeState(future), null);
  assert.equal(normalizeState(null), null);
  assert.equal(normalizeState([]), null);
});

test("una partida incompleta se completa con valores por defecto", () => {
  const original = {
    meta: { version: 1, createdAt: "2026-02-24T00:00:00.000Z", updatedAt: "2026-02-24T00:00:00.000Z", seed: "vieja" },
    player: { id: "x", name: "Antigua", gender: "femenino", level: 3, xp: 5, hp: 500, maxHp: 140, floor: 4 },
    progress: { floorsCleared: [1, 2, 3], lastCity: "Rubi" },
    inventory: { gold: -5, items: [] },
    skills: { weapons: {}, craft: {} },
    flags: {},
    log: ["algo"],
  };
  const state = normalizeState(original);

  assert.equal(state.player.name, "Antigua");
  assert.equal(state.player.level, 3);
  assert.equal(state.player.hp, 140, "la salud no supera el máximo");
  assert.equal(state.player.floor, 0, "sin expedición guardada vuelve a Rubi");
  assert.equal(state.inventory.gold, 0);
  assert.deepEqual(state.equipment, { weapon: null, charm: null, head: null });
  assert.deepEqual(state.progress.refuges, []);
  assert.equal(state.stats.battles, 0);
  assert.equal(state.meta.seed, "vieja");
});

test("sin almacenamiento disponible no falla", () => {
  const storage = createStorage(null);
  assert.equal(storage.available, false);
  assert.equal(storage.save(createNewGame({ seed: "s" })), false);
  assert.equal(storage.load(), null);
  storage.clear();

  const full = createStorage({
    getItem: () => null,
    setItem: () => {
      throw new Error("cuota");
    },
    removeItem: () => {},
  });
  assert.equal(full.save(createNewGame({ seed: "s" })), false);
});

test("el código exportado se puede importar, también con tildes", () => {
  const state = createNewGame({ name: "Íñigo", seed: "s" });
  state.log = ["¡Subes al nivel 2!"];
  assert.deepEqual(importSave(exportSave(state)), state);
  assert.equal(importSave("no es un código"), null);
  assert.equal(importSave(""), null);
});
