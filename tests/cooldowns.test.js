import assert from "node:assert/strict";
import { test } from "node:test";

import { SKILLS, isTechnique } from "../src/game/skills.js";
import { planRound } from "../src/ui/app.js";
import { COOLDOWN, cooldownGroup, cooldownKey, cooldownMs, createCooldowns } from "../src/ui/cooldowns.js";

function clock() {
  let at = 0;
  const now = () => at;
  now.advance = (ms) => {
    at += ms;
  };
  return now;
}

const ATTACK = { action: "act", type: "attack" };
const DEFEND = { action: "act", type: "defend" };
const FLEE = { action: "act", type: "flee" };

test("cada acción del juego tiene un enfriamiento razonable", () => {
  const durations = [
    ...Object.values(COOLDOWN.combat),
    ...Object.values(COOLDOWN.actions),
    COOLDOWN.round,
    COOLDOWN.arrival,
    COOLDOWN.outro,
  ];
  for (const ms of durations) {
    assert.ok(ms >= 250 && ms <= 2500, `fuera de rango: ${ms}`);
  }
  assert.equal(cooldownMs(ATTACK), COOLDOWN.combat.attack);
  assert.equal(cooldownMs({ action: "explore" }), COOLDOWN.actions.explore);
  assert.ok(cooldownMs(FLEE) > cooldownMs(ATTACK), "huir pesa más que atacar");
});

test("las técnicas se enfrían más cuanta más energía cuestan", () => {
  const techniques = SKILLS.filter(isTechnique).sort((a, b) => a.cost - b.cost);
  assert.ok(techniques.length >= 2);
  const times = techniques.map((skill) => cooldownMs({ action: "act", type: "skill", id: skill.id }));
  times.forEach((ms, index) => {
    assert.equal(ms, COOLDOWN.skill.base + COOLDOWN.skill.perEnergy * techniques[index].cost);
    assert.ok(ms > cooldownMs(ATTACK));
    assert.ok(ms <= 3000);
  });
});

test("la navegación no tiene enfriamiento", () => {
  for (const action of ["tab", "view", "save", "export", "new-game", "continue"]) {
    assert.equal(cooldownMs({ action }), 0);
    assert.equal(cooldownKey({ action }), null);
  }
  assert.equal(cooldownMs(undefined), 0);
});

test("cada botón tiene su propia clave", () => {
  assert.notEqual(cooldownKey(ATTACK), cooldownKey(DEFEND));
  assert.notEqual(cooldownKey({ action: "buy", id: "pocion-menor" }), cooldownKey({ action: "buy", id: "hierbas" }));
  assert.notEqual(cooldownKey({ action: "rest", kind: "inn" }), cooldownKey({ action: "rest", kind: "camp" }));
  assert.equal(cooldownKey({ action: "buy", id: "hierbas" }), cooldownKey({ action: "buy", id: "hierbas", hotkey: "3" }));
  assert.equal(cooldownGroup(ATTACK), cooldownGroup(FLEE));
  assert.equal(cooldownGroup({ action: "explore" }), null);
});

test("pulsar un botón lo enfría durante su tiempo y luego queda listo", () => {
  const now = clock();
  const cooldowns = createCooldowns(now);
  const explore = { action: "explore" };

  assert.equal(cooldowns.get(explore), null);
  cooldowns.press(explore);
  assert.deepEqual(cooldowns.get(explore), { total: 800, elapsed: 0, remaining: 800 });
  assert.equal(cooldowns.get({ action: "ascend" }), null, "no afecta a otros botones");

  now.advance(300);
  assert.deepEqual(cooldowns.get(explore), { total: 800, elapsed: 300, remaining: 500 });
  assert.equal(cooldowns.next(), 500);

  now.advance(500);
  assert.equal(cooldowns.get(explore), null);
  assert.equal(cooldowns.next(), null);
});

test("una acción de combate pausa un instante todas las demás", () => {
  const now = clock();
  const cooldowns = createCooldowns(now);

  cooldowns.press(ATTACK);
  assert.equal(cooldowns.get(ATTACK).remaining, COOLDOWN.combat.attack);
  assert.equal(cooldowns.get(DEFEND).remaining, COOLDOWN.round);
  assert.equal(cooldowns.get({ action: "explore" }), null, "fuera del combate no hay pausa común");

  now.advance(COOLDOWN.round);
  assert.equal(cooldowns.get(DEFEND), null);
  assert.equal(cooldowns.get(ATTACK).remaining, COOLDOWN.combat.attack - COOLDOWN.round);
});

test("al llegar a una pantalla los botones esperan, como mucho, el tiempo de llegada", () => {
  const now = clock();
  const cooldowns = createCooldowns(now);

  cooldowns.arrive({ action: "rest", kind: "inn" });
  cooldowns.arrive({ action: "buy", id: "hierbas" });
  cooldowns.arrive({ action: "tab", tab: "skills" });
  assert.equal(cooldowns.get({ action: "rest", kind: "inn" }).remaining, COOLDOWN.arrival);
  assert.equal(cooldowns.get({ action: "buy", id: "hierbas" }).remaining, COOLDOWN.actions.buy);
  assert.equal(cooldowns.get({ action: "tab", tab: "skills" }), null);
});

test("un enfriamiento nuevo nunca acorta el que ya está en marcha", () => {
  const now = clock();
  const cooldowns = createCooldowns(now);
  const flee = FLEE;

  cooldowns.press(flee);
  now.advance(100);
  cooldowns.arrive(flee);
  assert.equal(cooldowns.get(flee).remaining, COOLDOWN.combat.flee - 100);

  cooldowns.clear();
  assert.equal(cooldowns.get(flee), null);
});

test("los efectos de la ronda se escalonan: primero el jugador, luego los enemigos", () => {
  const times = planRound([
    { text: "Barres", target: 0, amount: 9 },
    { text: "Barres", target: 1, amount: 9, kill: true },
    { text: "Cae" },
    { text: "Te golpea", target: "you", source: 0, amount: 4 },
    { text: "Falla", source: 2 },
  ]);
  assert.equal(times.length, 5);
  assert.equal(times[0], 0);
  assert.ok(times[1] > times[0]);
  assert.ok(times[3] > times[2], "los enemigos responden después");
  assert.ok(times[4] > times[3]);
  assert.ok(Math.max(...times) < COOLDOWN.outro, "todo ocurre antes de cambiar de pantalla");
});
