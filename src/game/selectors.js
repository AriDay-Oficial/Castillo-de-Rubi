import { CITY_FLOOR, MAX_FLOOR } from "../content/floors.js";
import { createRng, generateEncounter, generateFloor } from "../procgen/index.js";
import { countItem, getAllItems, getItem, MAX_GEAR_LEVEL, SLOTS } from "./items.js";
import { BALANCE, buyPrice, getPlayerStats, upgradeCost } from "./rules.js";

const planCache = new Map();

/**
 * Piso de la expedición actual: lo que genera procgen más el efecto del
 * evento del piso. Cada expedición cambia la semilla, así que al volver a
 * subir los pisos no se repiten.
 */
export function getFloorPlan(seed, expedition, floor) {
  const key = `${seed}|${expedition}|${floor}`;
  if (planCache.has(key)) {
    return planCache.get(key);
  }
  const base = generateFloor({ floor, seed: `${seed}-${expedition}` });
  const hostile = !base.safe && !base.city;
  const encounters = [...base.encounters];
  let powerMod = 1;
  let rewardMod = 1;

  if (hostile && base.eventId === "patrulla") {
    const rng = createRng(`${seed}-${expedition}-${floor}-patrulla`);
    encounters.push({
      ...generateEncounter({ rng, difficulty: base.zone?.difficulty || "baja" }),
      patrol: true,
    });
  }
  if (hostile && base.eventId === "magia") {
    powerMod = BALANCE.events.magia.power;
    rewardMod = BALANCE.events.magia.rewards;
  }

  const plan = { ...base, encounters, powerMod, rewardMod };
  if (planCache.size > 50) {
    planCache.clear();
  }
  planCache.set(key, plan);
  return plan;
}

export function isInCity(state) {
  return state.player.floor === CITY_FLOOR || !state.run;
}

/** Situación del piso actual, o null si el jugador está en Rubi. */
export function getFloorStatus(state) {
  if (isInCity(state)) {
    return null;
  }
  const { run } = state;
  const plan = getFloorPlan(state.meta.seed, run.expedition, run.floor);
  const total = plan.encounters.length;
  const cleared = Math.min(run.cleared || 0, total);
  const bossDefeated = plan.boss ? state.progress.bossesDefeated.includes(plan.boss.id) : true;
  const bossPending = Boolean(plan.boss) && !bossDefeated;
  const complete = cleared >= total && !bossPending;

  return {
    plan,
    floor: run.floor,
    total,
    cleared,
    boss: plan.boss || null,
    bossPending,
    bossReady: bossPending && cleared >= total,
    complete,
    canAscend: complete && run.floor < MAX_FLOOR,
    isLastFloor: run.floor >= MAX_FLOOR,
    eventAvailable: !run.eventUsed,
  };
}

/** Puntos por los que se puede entrar al castillo desde Rubi. */
export function getDestinations(state) {
  const destinations = [{ id: "entrada", kind: "entrance", floor: 1 }];
  [...state.progress.refuges]
    .sort((a, b) => a - b)
    .forEach((floor) => destinations.push({ id: `refugio-${floor}`, kind: "refuge", floor }));
  if (state.progress.anchor) {
    destinations.push({ id: "cuerda", kind: "anchor", floor: state.progress.anchor.floor });
  }
  return destinations;
}

/** Tienda disponible donde está el jugador: la de Rubi o un mercader errante. */
export function getShop(state) {
  if (state.combat) {
    return null;
  }
  let markup;
  let name;
  if (isInCity(state)) {
    markup = 1;
    name = "Tienda de Rubi";
  } else if (getFloorStatus(state).plan.eventId === "mercader") {
    markup = BALANCE.events.mercader.markup;
    name = "Mercader errante";
  } else {
    return null;
  }
  const stock = getAllItems()
    .filter((item) => item.kind === "heal" || item.kind === "rope")
    .map((item) => ({ item, price: buyPrice(item, state.player.level, markup) }));
  return { name, markup, stock };
}

/** Qué puede hacer la herrería con cada ranura de equipo. */
export function getForgeOptions(state) {
  const stats = getPlayerStats(state);
  return SLOTS.map((slot) => {
    const piece = state.equipment[slot.id];
    if (piece) {
      const item = getItem(piece.id);
      return {
        slot,
        piece,
        item,
        action: piece.level < MAX_GEAR_LEVEL ? "upgrade" : null,
        cost: upgradeCost(item, piece.level, stats.forgeDiscount),
      };
    }
    const item = getAllItems().find(
      (candidate) =>
        candidate.kind === "gear" && candidate.slot === slot.id && candidate.rarity === "rare"
    );
    const owned = item ? countItem(state.inventory.items, item.id) > 0 : false;
    return {
      slot,
      piece: null,
      item: item || null,
      action: item && !owned ? "buy" : null,
      cost: item ? buyPrice(item, state.player.level) : null,
    };
  });
}

export function healAmount(item, stats) {
  return Math.round((stats.maxHp * item.percent * stats.healBonus) / 100);
}

/** Objetos curativos de la mochila, del más potente al menos. */
export function getHealItems(state) {
  return state.inventory.items
    .map((entry) => ({ entry, item: getItem(entry.id) }))
    .filter(({ item }) => item?.kind === "heal")
    .sort((a, b) => b.item.percent - a.item.percent);
}

export function getRopeCount(state) {
  return state.inventory.items
    .filter((entry) => getItem(entry.id)?.kind === "rope")
    .reduce((total, entry) => total + entry.qty, 0);
}
