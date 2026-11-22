import { MAX_FLOOR, getZoneForFloor } from "../content/floors.js";
import { createBossCombat, createEncounterCombat, resolveRound } from "./combat.js";
import {
  addItem,
  entryKey,
  findEntry,
  gearScore,
  getItem,
  itemLabel,
  MAX_GEAR_LEVEL,
  removeItem,
} from "./items.js";
import { BALANCE, baseStats, getPlayerStats, innPrice, sellPrice, xpToNext } from "./rules.js";
import {
  getDestinations,
  getFloorStatus,
  getForgeOptions,
  getShop,
  healAmount,
  isInCity,
} from "./selectors.js";
import { getRank, getSkill, SKILL_MAX_RANK } from "./skills.js";

const fail = (reason) => ({ ok: false, reason });
const OK = Object.freeze({ ok: true });

/**
 * Reglas del juego sobre el motor de estado. Cada acción comprueba que es
 * válida, aplica reductores y devuelve { ok } o { ok: false, reason }.
 * `rng` solo decide las tiradas de combate; los pisos salen de la semilla.
 */
export function createGame({ engine, bus, rng = Math.random }) {
  const get = () => engine.getState();
  const apply = (type, payload) => engine.apply(type, payload);
  const say = (text, kind = "info") => apply("log", { text, kind });

  function guard({ combat = false, city } = {}) {
    const state = get();
    if (state.flags.defeat || state.flags.victoryPending) {
      return "Antes tienes que cerrar el resumen de la partida.";
    }
    if (!combat && state.combat) {
      return "No puedes hacer eso en mitad de un combate.";
    }
    if (city === true && !isInCity(state)) {
      return "Solo puedes hacer eso en Rubi.";
    }
    if (city === false && isInCity(state)) {
      return "Solo puedes hacer eso dentro del castillo.";
    }
    return null;
  }

  function start() {
    if (get().flags.started) {
      return;
    }
    engine.batch(() => {
      let { items } = get().inventory;
      for (const { id, qty } of BALANCE.starterKit) {
        items = addItem(items, id, { qty });
      }
      apply("updateInventory", { items });
      apply("setFlag", { name: "started", value: true });
      say("El gremio de aventureros te entrega una poción, hierbas y una cuerda.", "loot");
    });
  }

  function addGold(amount) {
    apply("updateInventory", { gold: get().inventory.gold + amount });
  }

  /** Guarda un objeto; el equipo mejor que el puesto se equipa solo. */
  function receiveItem(id, level) {
    const item = getItem(id);
    const state = get();
    const label = itemLabel(item, level);
    if (item.kind === "gear") {
      const current = state.equipment[item.slot];
      if (gearScore({ id, level }) > gearScore(current)) {
        apply("updateEquipment", { [item.slot]: { id, level: level || 0 } });
        if (current) {
          apply("updateInventory", {
            items: addItem(state.inventory.items, current.id, { level: current.level }),
          });
        }
        return { label, equipped: true };
      }
    }
    apply("updateInventory", { items: addItem(state.inventory.items, id, { level }) });
    return { label, equipped: false };
  }

  function gainXp(amount) {
    let { level, xp, skillPoints } = get().player;
    xp += amount;
    let levels = 0;
    while (xp >= xpToNext(level)) {
      xp -= xpToNext(level);
      level += 1;
      levels += 1;
    }
    if (levels === 0) {
      apply("updatePlayer", { xp });
      return 0;
    }
    const { maxHp } = baseStats(level);
    apply("updatePlayer", {
      xp,
      level,
      maxHp,
      hp: maxHp,
      energy: BALANCE.maxEnergy,
      skillPoints: skillPoints + levels,
    });
    say(
      `¡Subes al nivel ${level}! Salud y energía restauradas, +${levels} ${
        levels === 1 ? "punto" : "puntos"
      } de habilidad.`,
      "good"
    );
    bus.emit("player:levelup", { level, levels });
    return levels;
  }

  function arrive(floor) {
    const state = get();
    const { plan } = getFloorStatus(state);
    const zone = getZoneForFloor(floor);
    say(`Piso ${floor}: ${zone.name} (${zone.biome}). ${plan.event}`, "info");
    if (plan.safe && !state.progress.refuges.includes(floor)) {
      apply("updateProgress", { refuges: [...state.progress.refuges, floor] });
      say(`Refugio descubierto: desde Rubi ya puedes viajar al piso ${floor}.`, "good");
    }
    if (floor > (state.progress.maxFloor || 0)) {
      apply("updateProgress", { maxFloor: floor });
    }
  }

  function leaveCastle() {
    apply("setRun", null);
    apply("updatePlayer", { floor: 0 });
  }

  // --- Viajes ---

  function enterCastle(destinationId) {
    const blocked = guard({ city: true });
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const destination = getDestinations(state).find((candidate) => candidate.id === destinationId);
    if (!destination) {
      return fail("Ese destino no está disponible.");
    }
    engine.batch(() => {
      let run;
      if (destination.kind === "anchor") {
        run = { ...state.progress.anchor };
        apply("updateProgress", { anchor: null });
        say("Trepas por la cuerda hasta donde la dejaste atada.", "info");
      } else {
        const expedition = (state.progress.expeditions || 0) + 1;
        run = { floor: destination.floor, expedition, cleared: 0, eventUsed: false };
        apply("updateProgress", { expeditions: expedition });
      }
      apply("setRun", run);
      apply("updatePlayer", { floor: run.floor });
      arrive(run.floor);
    });
    return OK;
  }

  function ascend() {
    const blocked = guard({ city: false });
    if (blocked) {
      return fail(blocked);
    }
    const status = getFloorStatus(get());
    if (status.isLastFloor) {
      return fail("No hay más pisos: estás en la cima del castillo.");
    }
    if (!status.complete) {
      return fail(
        status.bossPending
          ? "El jefe del piso bloquea la escalera."
          : "Aún quedan enemigos entre tú y la escalera."
      );
    }
    engine.batch(() => {
      const { run } = get();
      apply("advanceFloor");
      apply("setRun", { ...run, floor: run.floor + 1, cleared: 0, eventUsed: false });
      arrive(run.floor + 1);
    });
    return OK;
  }

  /**
   * Vuelve a Rubi. "rope" gasta una cuerda y conserva el punto de regreso;
   * "travel" es gratis desde un refugio; "retreat" abandona la posición.
   */
  function returnToCity(mode) {
    const blocked = guard({ city: false });
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const status = getFloorStatus(state);
    if (mode === "travel" && !status.plan.safe) {
      return fail("Solo puedes viajar gratis desde un refugio.");
    }
    const rope = state.inventory.items.find((entry) => getItem(entry.id)?.kind === "rope");
    if (mode === "rope" && !rope) {
      return fail("No te quedan cuerdas.");
    }
    engine.batch(() => {
      if (mode === "rope") {
        apply("updateInventory", { items: removeItem(state.inventory.items, entryKey(rope)) });
        apply("updateProgress", { anchor: { ...state.run } });
        say(`Atas la cuerda y bajas a Rubi. Podrás volver al piso ${status.floor}.`, "info");
      } else if (mode === "travel") {
        say(`Viajas del refugio del piso ${status.floor} a Rubi.`, "info");
      } else {
        say(`Te retiras del piso ${status.floor} y vuelves a Rubi.`, "info");
      }
      leaveCastle();
    });
    return OK;
  }

  // --- Combate ---

  function beginCombat(combat) {
    engine.batch(() => {
      apply("setCombat", combat);
      say(
        combat.kind === "boss"
          ? `${combat.title}, jefe del piso ${combat.floor}, te cierra el paso.`
          : `Te sale al paso: ${combat.title}.`,
        "combat"
      );
    });
    bus.emit("combat:started", combat);
    return OK;
  }

  function explore() {
    const blocked = guard({ city: false });
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const status = getFloorStatus(state);
    if (status.cleared >= status.total) {
      return fail("No quedan enemigos por aquí.");
    }
    const encounter = status.plan.encounters[status.cleared];
    return beginCombat(
      createEncounterCombat({
        encounter,
        floor: status.floor,
        difficulty: status.plan.zone.difficulty,
        powerMod: status.plan.powerMod,
        rewardMod: status.plan.rewardMod,
        goldMod: encounter.patrol ? BALANCE.events.patrulla.gold : 1,
      })
    );
  }

  function challengeBoss() {
    const blocked = guard({ city: false });
    if (blocked) {
      return fail(blocked);
    }
    const status = getFloorStatus(get());
    if (!status.bossReady) {
      return fail("Aún no puedes enfrentarte al jefe.");
    }
    return beginCombat(
      createBossCombat({
        boss: status.boss,
        floor: status.floor,
        difficulty: status.plan.zone.difficulty,
      })
    );
  }

  function finishVictory(combat) {
    const before = get();
    const stats = getPlayerStats(before);
    const gold = Math.round(combat.rewards.gold * (0.85 + 0.3 * rng()) * stats.goldBonus);
    const isBoss = combat.kind === "boss";
    const summary = { title: combat.title, boss: isBoss, xp: combat.rewards.xp, gold, loot: [], levels: 0 };

    apply("setCombat", null);
    addGold(gold);
    for (const drop of combat.rewards.loot) {
      summary.loot.push(receiveItem(drop.id, drop.level));
    }
    apply("addStats", {
      battles: 1,
      kills: combat.enemies.length,
      goldEarned: gold,
      bosses: isBoss ? 1 : 0,
    });
    const lootText = summary.loot
      .map((drop) => (drop.equipped ? `${drop.label} (equipado)` : drop.label))
      .join(", ");
    say(
      `Victoria contra ${combat.title}: +${summary.xp} de experiencia, +${gold} de oro` +
        (lootText ? ` y botín: ${lootText}.` : "."),
      "loot"
    );

    if (isBoss) {
      const defeated = get().progress.bossesDefeated;
      if (!defeated.includes(combat.bossId)) {
        apply("updateProgress", { bossesDefeated: [...defeated, combat.bossId] });
      }
    } else {
      const { run } = get();
      apply("setRun", { ...run, cleared: (run.cleared || 0) + 1 });
    }
    summary.levels = gainXp(summary.xp);

    if (isBoss && combat.floor >= MAX_FLOOR) {
      const state = get();
      if (!state.flags.victory) {
        apply("setFlag", {
          name: "victory",
          value: { at: new Date().toISOString(), level: state.player.level, stats: state.stats },
        });
      }
      apply("setFlag", { name: "victoryPending", value: true });
      say("El Rey de la catedral ha caído. ¡Has conquistado el castillo de Rubi!", "good");
      apply("updatePlayer", { hp: get().player.maxHp, energy: BALANCE.maxEnergy });
      leaveCastle();
    }
    bus.emit("combat:won", summary);
  }

  function finishDefeat(combat) {
    const state = get();
    const goldLost = Math.floor(state.inventory.gold * BALANCE.deathGoldLoss);
    apply("setCombat", null);
    apply("updateInventory", { gold: state.inventory.gold - goldLost });
    apply("updatePlayer", { hp: state.player.maxHp, energy: BALANCE.maxEnergy });
    apply("addStats", { deaths: 1 });
    apply("setFlag", {
      name: "defeat",
      value: { floor: combat.floor, by: combat.title, goldLost },
    });
    say(
      `Caes ante ${combat.title} en el piso ${combat.floor}. Despiertas en Rubi con ${goldLost} de oro menos.`,
      "bad"
    );
    leaveCastle();
    bus.emit("combat:lost", { title: combat.title, floor: combat.floor, goldLost });
  }

  /** Ejecuta una acción de combate; `{ type: "item", key }` usa un objeto curativo. */
  function act(action) {
    const blocked = guard({ combat: true });
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    if (!state.combat) {
      return fail("No estás en combate.");
    }
    const stats = getPlayerStats(state);
    let resolved = action;
    let usedKey = null;
    if (action?.type === "item") {
      const entry = findEntry(state.inventory.items, action.key);
      const item = entry && getItem(entry.id);
      if (item?.kind !== "heal") {
        return fail("Ese objeto no se puede usar en combate.");
      }
      usedKey = action.key;
      resolved = { type: "item", name: item.name, heal: healAmount(item, stats) };
    }

    const result = resolveRound({
      combat: state.combat,
      hp: state.player.hp,
      energy: state.player.energy,
      stats,
      skills: state.skills,
      action: resolved,
      rng,
    });
    if (!result.ok) {
      return result;
    }

    engine.batch(() => {
      if (usedKey) {
        apply("updateInventory", { items: removeItem(state.inventory.items, usedKey) });
      }
      apply("updatePlayer", { hp: result.hp, energy: result.energy });
      apply("addStats", { turns: 1 });
      if (result.outcome === "ongoing") {
        apply("setCombat", result.combat);
      } else if (result.outcome === "fled") {
        apply("setCombat", null);
        apply("addStats", { fled: 1 });
        say(`Huyes de ${state.combat.title}.`, "info");
      } else if (result.outcome === "victory") {
        finishVictory(result.combat);
      } else {
        finishDefeat(result.combat);
      }
    });
    bus.emit("combat:round", { events: result.events, outcome: result.outcome });
    return { ok: true, outcome: result.outcome, events: result.events };
  }

  // --- Descanso y eventos de piso ---

  function rest(kind) {
    const blocked = guard();
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const { hp, maxHp, energy, level } = state.player;
    const full = { hp: maxHp, energy: BALANCE.maxEnergy };

    if (kind === "camp") {
      if (isInCity(state) || !getFloorStatus(state).plan.safe) {
        return fail("Aquí no hay hoguera donde descansar.");
      }
      engine.batch(() => {
        apply("updatePlayer", full);
        say("Descansas junto a la hoguera del refugio. Salud y energía al máximo.", "good");
      });
      return OK;
    }
    if (!isInCity(state)) {
      return fail("Solo puedes hacer eso en Rubi.");
    }
    if (kind === "inn") {
      const price = innPrice(level);
      if (hp >= maxHp && energy >= BALANCE.maxEnergy) {
        return fail("Ya estás en plena forma.");
      }
      if (state.inventory.gold < price) {
        return fail("No tienes oro suficiente para la posada.");
      }
      engine.batch(() => {
        addGold(-price);
        apply("updatePlayer", full);
        say(`Pasas la noche en la posada (${price} de oro). Salud y energía al máximo.`, "good");
      });
      return OK;
    }
    const target = Math.round(maxHp * BALANCE.freeRestHeal);
    if (hp >= target) {
      return fail("Dormir al raso ya no te hará recuperar más salud.");
    }
    engine.batch(() => {
      apply("updatePlayer", { hp: target });
      say("Duermes al raso junto a la muralla y recuperas parte de la salud.", "info");
    });
    return OK;
  }

  function pray() {
    const blocked = guard({ city: false });
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const status = getFloorStatus(state);
    if (status.plan.eventId !== "altar" || !status.eventAvailable) {
      return fail("Aquí no hay ningún altar que responda.");
    }
    const { hp, maxHp } = state.player;
    const healed = Math.min(maxHp - hp, Math.round(maxHp * BALANCE.events.altar.heal));
    engine.batch(() => {
      apply("updatePlayer", { hp: hp + healed, energy: BALANCE.maxEnergy });
      apply("setRun", { ...state.run, eventUsed: true });
      say(`Las runas del altar se iluminan: +${healed} de salud y energía al máximo.`, "good");
    });
    return OK;
  }

  // --- Comercio y herrería ---

  function buy(itemId) {
    const blocked = guard();
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const offer = getShop(state)?.stock.find((candidate) => candidate.item.id === itemId);
    if (!offer) {
      return fail("Eso no está a la venta aquí.");
    }
    if (state.inventory.gold < offer.price) {
      return fail("No tienes oro suficiente.");
    }
    engine.batch(() => {
      apply("updateInventory", {
        gold: state.inventory.gold - offer.price,
        items: addItem(state.inventory.items, itemId),
      });
      say(`Compras ${offer.item.name} por ${offer.price} de oro.`, "info");
    });
    return OK;
  }

  function sell(key) {
    const blocked = guard();
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    if (!getShop(state)) {
      return fail("Aquí no hay nadie a quien vender.");
    }
    const entry = findEntry(state.inventory.items, key);
    if (!entry) {
      return fail("No tienes ese objeto.");
    }
    const item = getItem(entry.id);
    const price = sellPrice(item, entry.level, state.player.level, getPlayerStats(state).goldBonus);
    engine.batch(() => {
      apply("updateInventory", {
        gold: state.inventory.gold + price,
        items: removeItem(state.inventory.items, key),
      });
      say(`Vendes ${itemLabel(item, entry.level)} por ${price} de oro.`, "info");
    });
    return OK;
  }

  /** Herrería de Rubi: mejora la pieza de la ranura o, si está vacía, forja una básica. */
  function forge(slotId) {
    const blocked = guard({ city: true });
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const option = getForgeOptions(state).find((candidate) => candidate.slot.id === slotId);
    if (!option?.action) {
      return fail("La herrera no puede hacer nada con esa ranura.");
    }
    if (state.inventory.gold < option.cost) {
      return fail("No tienes oro suficiente.");
    }
    engine.batch(() => {
      addGold(-option.cost);
      if (option.action === "upgrade") {
        const piece = { ...option.piece, level: option.piece.level + 1 };
        apply("updateEquipment", { [slotId]: piece });
        say(`La herrera mejora tu equipo: ${itemLabel(option.item, piece.level)}.`, "good");
      } else {
        apply("updateEquipment", { [slotId]: { id: option.item.id, level: 0 } });
        say(`La herrera te forja: ${option.item.name}.`, "good");
      }
    });
    return OK;
  }

  // --- Mochila y equipo ---

  function equip(key) {
    const blocked = guard();
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const entry = findEntry(state.inventory.items, key);
    const item = entry && getItem(entry.id);
    if (item?.kind !== "gear") {
      return fail("Eso no se puede equipar.");
    }
    engine.batch(() => {
      const current = state.equipment[item.slot];
      let items = removeItem(state.inventory.items, key);
      if (current) {
        items = addItem(items, current.id, { level: current.level });
      }
      apply("updateInventory", { items });
      apply("updateEquipment", { [item.slot]: { id: entry.id, level: entry.level || 0 } });
      say(`Te equipas: ${itemLabel(item, entry.level)}.`, "info");
    });
    return OK;
  }

  function unequip(slotId) {
    const blocked = guard();
    if (blocked) {
      return fail(blocked);
    }
    const state = get();
    const piece = state.equipment[slotId];
    if (!piece) {
      return fail("No llevas nada en esa ranura.");
    }
    engine.batch(() => {
      apply("updateInventory", {
        items: addItem(state.inventory.items, piece.id, { level: piece.level }),
      });
      apply("updateEquipment", { [slotId]: null });
      say(`Guardas en la mochila: ${itemLabel(getItem(piece.id), piece.level)}.`, "info");
    });
    return OK;
  }

  /** Usa un objeto de la mochila. Los núcleos necesitan `slotId`: la pieza que mejoran. */
  function useItem(key, slotId) {
    const state = get();
    const entry = findEntry(state.inventory.items, key);
    const item = entry && getItem(entry.id);
    if (!item) {
      return fail("No tienes ese objeto.");
    }
    if (state.combat) {
      return act({ type: "item", key });
    }
    const blocked = guard();
    if (blocked) {
      return fail(blocked);
    }

    switch (item.kind) {
      case "heal": {
        const { hp, maxHp } = state.player;
        if (hp >= maxHp) {
          return fail("Ya tienes la salud al máximo.");
        }
        const healed = Math.min(maxHp - hp, healAmount(item, getPlayerStats(state)));
        engine.batch(() => {
          apply("updateInventory", { items: removeItem(state.inventory.items, key) });
          apply("updatePlayer", { hp: hp + healed });
          say(`Usas ${item.name}: recuperas ${healed} de salud.`, "good");
        });
        return OK;
      }
      case "rope":
        return returnToCity("rope");
      case "gear":
        return equip(key);
      case "upgrade": {
        const piece = state.equipment[slotId];
        if (!piece) {
          return fail("Elige una pieza de equipo que lleves puesta.");
        }
        if (piece.level >= MAX_GEAR_LEVEL) {
          return fail("Esa pieza ya está al máximo.");
        }
        const upgraded = { ...piece, level: Math.min(MAX_GEAR_LEVEL, piece.level + item.levels) };
        engine.batch(() => {
          apply("updateInventory", { items: removeItem(state.inventory.items, key) });
          apply("updateEquipment", { [slotId]: upgraded });
          say(`El núcleo se funde con tu equipo: ${itemLabel(getItem(piece.id), upgraded.level)}.`, "good");
        });
        return OK;
      }
      default:
        return fail("No sabes qué hacer con eso.");
    }
  }

  // --- Habilidades ---

  function learnSkill(id) {
    const state = get();
    const skill = getSkill(id);
    if (!skill) {
      return fail("Esa habilidad no existe.");
    }
    if (state.player.skillPoints < 1) {
      return fail("No tienes puntos de habilidad.");
    }
    const rank = getRank(state.skills, id);
    if (rank >= SKILL_MAX_RANK) {
      return fail("Esa habilidad ya está al máximo.");
    }
    engine.batch(() => {
      apply("setSkill", { group: skill.group, id, rank: rank + 1 });
      apply("updatePlayer", { skillPoints: state.player.skillPoints - 1 });
      say(`${skill.name} sube al rango ${rank + 1}.`, "good");
    });
    return OK;
  }

  // --- Fin de partida ---

  function acknowledge(flag) {
    if (flag !== "defeat" && flag !== "victoryPending") {
      return fail("Nada que cerrar.");
    }
    apply("setFlag", { name: flag, value: null });
    return OK;
  }

  return {
    start,
    enterCastle,
    ascend,
    returnToCity,
    explore,
    challengeBoss,
    act,
    rest,
    pray,
    buy,
    sell,
    forge,
    equip,
    unequip,
    useItem,
    learnSkill,
    acknowledge,
  };
}
