import assert from "node:assert/strict";
import { test } from "node:test";

import { BOSSES } from "../src/content/bosses.js";
import { ENEMY_TIERS } from "../src/content/enemies.js";
import { LOOT_TABLES } from "../src/content/items.js";
import { createNewGame } from "../src/core/state.js";
import {
  addItem,
  countItem,
  entryKey,
  findEntry,
  gearBonus,
  getItem,
  parseEffect,
  removeItem,
} from "../src/game/items.js";
import {
  baseStats,
  bossStats,
  buyPrice,
  computeDamage,
  dropLevel,
  enemyStats,
  estimateDanger,
  getPlayerStats,
  powerMultiplier,
  sellPrice,
  upgradeCost,
  xpToNext,
} from "../src/game/rules.js";
import { SKILL_MAX_RANK, SKILLS } from "../src/game/skills.js";

test("todos los efectos del contenido tienen una regla", () => {
  assert.deepEqual(parseEffect("cura 20"), { kind: "heal", percent: 20 });
  assert.deepEqual(parseEffect("+5 ataque"), { kind: "gear", slot: "weapon", attack: 5, defense: 0 });
  assert.deepEqual(parseEffect("+5 defensa"), { kind: "gear", slot: "charm", attack: 0, defense: 5 });
  assert.deepEqual(parseEffect("+10 poder"), { kind: "gear", slot: "head", attack: 5, defense: 5 });
  assert.equal(parseEffect("util").kind, "rope");
  assert.equal(parseEffect("upgrade").kind, "upgrade");
  assert.equal(parseEffect("algo raro").kind, "misc");

  for (const item of Object.values(LOOT_TABLES).flat()) {
    assert.notEqual(getItem(item.id).kind, "misc", item.id);
  }
});

test("el equipo suma su bonificación base por cada nivel de mejora", () => {
  const sword = getItem("espada-antigua");
  assert.deepEqual(gearBonus(sword, 0), { attack: 5, defense: 0 });
  assert.deepEqual(gearBonus(sword, 3), { attack: 20, defense: 0 });
  assert.deepEqual(gearBonus(getItem("corona-oscura"), 1), { attack: 10, defense: 10 });
  assert.deepEqual(gearBonus(getItem("cuerda"), 2), { attack: 0, defense: 0 });
});

test("la mochila apila por objeto y nivel sin mutar la lista", () => {
  const empty = [];
  let items = addItem(empty, "hierbas");
  items = addItem(items, "hierbas", { qty: 2 });
  items = addItem(items, "espada-antigua", { level: 1 });
  items = addItem(items, "espada-antigua", { level: 2 });

  assert.equal(empty.length, 0);
  assert.equal(countItem(items, "hierbas"), 3);
  assert.equal(items.length, 3);
  assert.equal(findEntry(items, "espada-antigua+2").qty, 1);
  assert.equal(entryKey(items[0]), "hierbas");

  const fewer = removeItem(items, "hierbas", 3);
  assert.equal(countItem(fewer, "hierbas"), 0);
  assert.equal(countItem(items, "hierbas"), 3);
});

test("la experiencia necesaria y las estadísticas crecen con el nivel", () => {
  assert.equal(xpToNext(1), 40);
  assert.deepEqual(baseStats(1), { maxHp: 100, attack: 20, defense: 12 });
  for (let level = 1; level < 60; level += 1) {
    assert.ok(xpToNext(level + 1) > xpToNext(level));
    assert.ok(baseStats(level + 1).attack > baseStats(level).attack);
    assert.ok(baseStats(level + 1).maxHp > baseStats(level).maxHp);
  }
});

test("las estadísticas del jugador suman equipo y habilidades", () => {
  const state = createNewGame({ name: "Prueba", seed: "s" });
  const bare = getPlayerStats(state);
  assert.equal(bare.attack, 20);
  assert.equal(bare.defense, 12);
  assert.equal(bare.maxHp, state.player.maxHp);

  state.equipment.weapon = { id: "espada-antigua", level: 1 };
  state.equipment.head = { id: "corona-oscura", level: 0 };
  state.skills.weapons.maestria = 5;
  state.skills.craft.alquimia = 2;
  const geared = getPlayerStats(state);
  assert.equal(geared.attack, Math.round((20 + 10 + 5) * 1.15));
  assert.equal(geared.defense, 12 + 5);
  assert.ok(geared.critChance > bare.critChance);
  assert.equal(geared.healBonus, 1.2);
});

test("el poder de los enemigos crece sin saltos bruscos entre tramos", () => {
  assert.equal(powerMultiplier(1), 1);
  const averagePower = (tier, floor) =>
    (tier.reduce((total, enemy) => total + enemy.power, 0) / tier.length) * powerMultiplier(floor);
  const tiers = [
    [ENEMY_TIERS.baja, 1, 10],
    [ENEMY_TIERS.media, 11, 25],
    [ENEMY_TIERS.mediaAlta, 26, 50],
    [ENEMY_TIERS.alta, 51, 74],
    [ENEMY_TIERS.extrema, 75, 100],
  ];
  let previous = 0;
  for (const [tier, start, end] of tiers) {
    for (let floor = start; floor <= end; floor += 1) {
      const power = averagePower(tier, floor);
      assert.ok(power > previous, `el piso ${floor} no es más fuerte que el anterior`);
      assert.ok(previous === 0 || power / previous < 1.2, `salto brusco en el piso ${floor}`);
      previous = power;
    }
  }
});

test("el daño baja con la defensa y nunca es menor que 1", () => {
  assert.equal(computeDamage(100, 100), 50);
  assert.ok(computeDamage(100, 0) > computeDamage(100, 50));
  assert.ok(computeDamage(100, 50) > computeDamage(100, 200));
  assert.equal(computeDamage(1, 9999), 1);
  assert.ok(computeDamage(100, 100, 0) < computeDamage(100, 100, 1));
  assert.equal(computeDamage(100, 100, 0.5, 2), 100);
});

test("en grupo cada enemigo es más débil, y las zonas difíciles los endurecen", () => {
  const solo = enemyStats(20, [], 1);
  const pack = enemyStats(20, [], 3);
  assert.ok(pack.maxHp < solo.maxHp);
  assert.ok(pack.attack < solo.attack);
  assert.ok(pack.maxHp * 3 > solo.maxHp);

  const hard = enemyStats(20, [], 1, "alta");
  assert.ok(hard.maxHp > solo.maxHp && hard.attack > solo.attack);
  assert.ok(enemyStats(20, ["mago"]).attack > solo.attack);
  assert.ok(enemyStats(20, ["mago"]).maxHp < solo.maxHp);
  assert.ok(bossStats(20, "baja").maxHp > solo.maxHp);
});

test("la estimación de peligro crece con la fuerza del enemigo", () => {
  const state = createNewGame({ seed: "s" });
  const stats = getPlayerStats(state);
  const weak = [{ hp: 20, ...enemyStats(4, []) }];
  const boss = [{ hp: bossStats(BOSSES[0].power, "baja").maxHp, ...bossStats(BOSSES[0].power, "baja") }];

  assert.equal(estimateDanger(stats, 100, weak).id, "facil");
  assert.equal(estimateDanger(stats, 100, boss, true).id, "extremo");
  assert.ok(estimateDanger(stats, 100, boss, true).ratio > estimateDanger(stats, 100, weak).ratio);
  assert.ok(estimateDanger(stats, 10, weak).ratio > estimateDanger(stats, 100, weak).ratio);
});

test("los precios escalan y vender nunca da más que comprar", () => {
  const potion = getItem("pocion-menor");
  const sword = getItem("espada-antigua");
  assert.ok(buyPrice(potion, 10) > buyPrice(potion, 1));
  assert.ok(buyPrice(potion, 5, 1.25) > buyPrice(potion, 5));
  assert.ok(sellPrice(potion, undefined, 5) < buyPrice(potion, 5));
  assert.ok(sellPrice(sword, 0, 1) < buyPrice(sword, 1));
  assert.equal(buyPrice(getItem("nucleo-elemental"), 5), null);

  assert.ok(upgradeCost(sword, 3) > upgradeCost(sword, 2));
  assert.ok(upgradeCost(sword, 3, 0.3) < upgradeCost(sword, 3));
  assert.equal(upgradeCost(getItem("corona-oscura"), 0), 2 * upgradeCost(sword, 0));
  assert.equal(upgradeCost(sword, 25), null);
  assert.equal(dropLevel(9), 0);
  assert.equal(dropLevel(57), 5);
});

test("cada habilidad mejora con el rango y se describe en texto", () => {
  for (const skill of SKILLS) {
    for (let rank = 1; rank <= SKILL_MAX_RANK; rank += 1) {
      const text = skill.describe(skill.effect(rank));
      assert.ok(text.length > 10 && !text.includes("NaN") && !text.includes("undefined"), skill.id);
    }
    const first = Object.values(skill.effect(1))[0];
    const last = Object.values(skill.effect(SKILL_MAX_RANK))[0];
    assert.ok(last > first, skill.id);
  }
});
