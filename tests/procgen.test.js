import assert from "node:assert/strict";
import { test } from "node:test";

import { BOSSES } from "../src/content/bosses.js";
import { SAFE_FLOORS } from "../src/content/floors.js";
import { createRng, generateFloor, pick, randomInt } from "../src/procgen/index.js";

test("createRng es determinista y devuelve valores en [0, 1)", () => {
  const first = createRng("rubi");
  const second = createRng("rubi");
  const other = createRng("otra");
  const values = Array.from({ length: 200 }, () => first());

  assert.deepEqual(values, Array.from({ length: 200 }, () => second()));
  assert.notDeepEqual(values.slice(0, 5), Array.from({ length: 5 }, () => other()));
  assert.ok(values.every((value) => value >= 0 && value < 1));
});

test("createRng reparte los valores de forma razonablemente uniforme", () => {
  const rng = createRng("uniforme");
  const buckets = new Array(10).fill(0);
  for (let index = 0; index < 10000; index += 1) {
    buckets[Math.floor(rng() * 10)] += 1;
  }
  assert.ok(buckets.every((count) => count > 850 && count < 1150), buckets.join(","));
});

test("pick y randomInt respetan sus límites", () => {
  const rng = createRng("limites");
  const list = ["a", "b", "c"];
  for (let index = 0; index < 100; index += 1) {
    assert.ok(list.includes(pick(rng, list)));
    const value = randomInt(rng, 2, 5);
    assert.ok(Number.isInteger(value) && value >= 2 && value <= 5);
  }
  assert.equal(pick(rng, []), undefined);
});

test("generateFloor da el mismo piso para la misma semilla", () => {
  assert.deepEqual(generateFloor({ floor: 7, seed: "abc" }), generateFloor({ floor: 7, seed: "abc" }));
  assert.notDeepEqual(
    generateFloor({ floor: 7, seed: "abc" }).encounters,
    generateFloor({ floor: 7, seed: "xyz" }).encounters
  );
});

test("la ciudad y los refugios no tienen encuentros; el resto, de 3 a 5", () => {
  assert.equal(generateFloor({ floor: 0, seed: "s" }).encounters.length, 0);
  assert.equal(generateFloor({ floor: 0, seed: "s" }).city, true);
  for (let floor = 1; floor <= 100; floor += 1) {
    const plan = generateFloor({ floor, seed: "s" });
    if (SAFE_FLOORS.has(floor)) {
      assert.equal(plan.safe, true);
      assert.equal(plan.encounters.length, 0);
    } else {
      assert.ok(plan.encounters.length >= 3 && plan.encounters.length <= 5);
      for (const encounter of plan.encounters) {
        assert.ok(encounter.enemy && encounter.loot);
        assert.ok(encounter.count >= 1 && encounter.count <= 3);
      }
    }
    assert.equal(typeof plan.event, "string");
    assert.ok(plan.eventId);
  }
});

test("cada jefe aparece en su piso", () => {
  for (const boss of BOSSES) {
    assert.equal(generateFloor({ floor: boss.floor, seed: "s" }).boss.id, boss.id);
  }
  assert.equal(generateFloor({ floor: 9, seed: "s" }).boss, undefined);
});
