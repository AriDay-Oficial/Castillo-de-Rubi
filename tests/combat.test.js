import assert from "node:assert/strict";
import { test } from "node:test";

import { BOSSES } from "../src/content/bosses.js";
import { ENEMY_TIERS } from "../src/content/enemies.js";
import { LOOT_TABLES } from "../src/content/items.js";
import {
  createBossCombat,
  createEncounterCombat,
  isBlastIncoming,
  resolveRound,
} from "../src/game/combat.js";
import { BALANCE } from "../src/game/rules.js";

const STATS = {
  maxHp: 200,
  attack: 12,
  defense: 20,
  critChance: 0,
  critMultiplier: 1.75,
  block: 0.5,
};
const SKILLS = { weapons: { golpe: 1, barrido: 1, aliento: 1 }, craft: {} };
const fixed = (value) => () => value;

function wolves(count = 2) {
  return createEncounterCombat({
    encounter: { enemy: ENEMY_TIERS.baja[1], count, loot: LOOT_TABLES.rare[0] },
    floor: 12,
    difficulty: "baja",
  });
}

function round(combat, action, overrides = {}) {
  return resolveRound({
    combat,
    hp: 200,
    energy: 3,
    stats: STATS,
    skills: SKILLS,
    action,
    rng: fixed(0.5),
    ...overrides,
  });
}

test("un encuentro crea un enemigo por cabeza y recompensas según la amenaza", () => {
  const combat = wolves(3);
  assert.equal(combat.enemies.length, 3);
  assert.equal(combat.enemies[0].name, "Lobo gris 1");
  assert.ok(combat.enemies.every((enemy) => enemy.hp === enemy.maxHp && enemy.hp > 0));
  assert.equal(combat.rewards.xp, combat.threat);
  assert.deepEqual(combat.rewards.loot, [{ id: "espada-antigua", level: 1 }]);
  assert.ok(wolves(3).threat > wolves(1).threat);
});

test("atacar daña al primer enemigo vivo y después contraatacan los que quedan", () => {
  const combat = wolves(2);
  const result = round(combat, { type: "attack" });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "ongoing");
  assert.ok(result.combat.enemies[0].hp < combat.enemies[0].hp);
  assert.equal(result.combat.enemies[1].hp, combat.enemies[1].hp);
  assert.ok(result.hp < 200);
  assert.equal(result.combat.round, 2);
  assert.equal(combat.enemies[0].hp, combat.enemies[0].maxHp, "no debe mutar el combate original");
});

test("derribar a un enemigo da energía y vencer a todos gana el combate", () => {
  const strong = { ...STATS, attack: 5000 };
  const first = round(wolves(2), { type: "attack" }, { stats: strong });
  assert.equal(first.kills, 1);
  assert.equal(first.energy, 4);
  assert.equal(first.outcome, "ongoing");

  const second = round(first.combat, { type: "attack" }, { stats: strong, hp: first.hp, energy: first.energy });
  assert.equal(second.outcome, "victory");
  assert.equal(second.hp, first.hp, "al ganar no hay contraataque");
  assert.equal(second.energy, BALANCE.maxEnergy);
});

test("las técnicas gastan energía y exigen conocerlas", () => {
  const combat = wolves(3);
  const sweep = round(combat, { type: "skill", id: "barrido" });
  assert.equal(sweep.energy, 1);
  assert.ok(sweep.combat.enemies.every((enemy, index) => enemy.hp < combat.enemies[index].hp));

  const strike = round(combat, { type: "skill", id: "golpe" });
  const basic = round(combat, { type: "attack" });
  assert.ok(strike.combat.enemies[0].hp < basic.combat.enemies[0].hp);

  assert.equal(round(combat, { type: "skill", id: "barrido" }, { energy: 1 }).ok, false);
  assert.equal(round(combat, { type: "skill", id: "golpe" }, { skills: { weapons: {}, craft: {} } }).ok, false);
  assert.equal(round(combat, { type: "skill", id: "maestria" }).ok, false);
  assert.equal(round(combat, { type: "bailar" }).ok, false);
});

test("curarse no pasa de la salud máxima y no se puede con la salud llena", () => {
  const combat = wolves(1);
  assert.equal(round(combat, { type: "skill", id: "aliento" }).ok, false);
  assert.equal(round(combat, { type: "item", name: "Poción", heal: 40 }).ok, false);

  const healed = round(combat, { type: "item", name: "Poción", heal: 500 }, { hp: 100, rng: fixed(0) });
  assert.ok(healed.ok);
  assert.ok(healed.events[0].text.includes("100"));

  const breath = round(combat, { type: "skill", id: "aliento" }, { hp: 50, rng: fixed(0) });
  assert.equal(breath.energy, 0);
  assert.ok(breath.events[0].tone === "heal");
});

test("defenderse reduce el daño recibido", () => {
  const combat = wolves(2);
  const open = round(combat, { type: "attack" });
  const guarded = round(combat, { type: "defend" });
  assert.ok(200 - guarded.hp < 200 - open.hp);
  assert.ok(guarded.hp < 200);
});

test("huir depende de la tirada y es imposible contra un jefe", () => {
  const combat = wolves(2);
  const escaped = round(combat, { type: "flee" }, { rng: fixed(0.1) });
  assert.equal(escaped.outcome, "fled");
  assert.equal(escaped.hp, 200);

  const caught = round(combat, { type: "flee" }, { rng: fixed(0.9) });
  assert.equal(caught.outcome, "ongoing");
  assert.ok(caught.hp < 200);

  const boss = createBossCombat({ boss: BOSSES[0], floor: 10, difficulty: "baja" });
  assert.equal(round(boss, { type: "flee" }).ok, false);
});

test("quedarse sin salud es una derrota", () => {
  const result = round(wolves(3), { type: "attack" }, { hp: 1 });
  assert.equal(result.outcome, "defeat");
  assert.equal(result.hp, 0);
});

test("el jefe avisa de su golpe devastador y defenderse lo amortigua", () => {
  let combat = createBossCombat({ boss: BOSSES[0], floor: 10, difficulty: "baja" });
  assert.equal(combat.enemies.length, 1);
  assert.deepEqual(
    combat.rewards.loot.map((drop) => drop.id),
    LOOT_TABLES.boss.map((item) => item.id)
  );

  const stats = { ...STATS, maxHp: 100000 };
  const damageTaken = [];
  let hp = 100000;
  for (let turn = 0; turn < 2; turn += 1) {
    const result = round(combat, { type: "attack" }, { stats, hp });
    damageTaken.push(hp - result.hp);
    hp = result.hp;
    combat = result.combat;
    assert.equal(isBlastIncoming(combat), false);
  }

  const charge = round(combat, { type: "attack" }, { stats, hp });
  assert.equal(charge.hp, hp, "en la ronda de preparación el jefe no ataca");
  assert.equal(isBlastIncoming(charge.combat), true);
  assert.ok(charge.events.some((event) => event.tone === "warn"));

  const open = round(charge.combat, { type: "attack" }, { stats, hp });
  const guarded = round(charge.combat, { type: "defend" }, { stats, hp, energy: 0 });
  assert.ok(hp - open.hp > damageTaken[0] * 2, "el golpe devastador duele más del doble");
  assert.ok(hp - guarded.hp < hp - open.hp);
  assert.equal(guarded.energy, 1, "bloquearlo da energía");
  assert.equal(isBlastIncoming(open.combat), false);
});

test("los sucesos de la ronda dicen a quién afectan y cuánto, para animarlos", () => {
  const combat = wolves(2);
  const result = round(combat, { type: "attack" });
  const strike = result.events.find((event) => event.target === 0);
  const hurt = result.events.filter((event) => event.target === "you");

  assert.equal(strike.amount, combat.enemies[0].hp - result.combat.enemies[0].hp);
  assert.equal(strike.kill, false);
  assert.equal(strike.crit, false);
  assert.deepEqual(hurt.map((event) => event.source), [0, 1]);
  assert.equal(hurt.reduce((sum, event) => sum + event.amount, 0), 200 - result.hp);

  const lethal = round(wolves(2), { type: "attack" }, { stats: { ...STATS, attack: 5000 } });
  assert.equal(lethal.events.find((event) => event.target === 0).kill, true);
  assert.deepEqual(lethal.events.filter((event) => event.target === "you").map((event) => event.source), [1]);

  const heal = round(wolves(1), { type: "skill", id: "aliento" }, { hp: 50 });
  const healed = heal.events.find((event) => event.target === "you" && event.source === undefined);
  assert.ok(healed.amount > 0);
});
