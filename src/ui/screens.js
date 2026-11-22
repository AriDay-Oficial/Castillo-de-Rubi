import { getZoneForFloor } from "../content/floors.js";
import { createBossCombat, isBlastIncoming } from "../game/combat.js";
import { describeItem, entryKey, getItem, itemLabel } from "../game/items.js";
import {
  BALANCE,
  estimateDanger,
  getPlayerStats,
  innPrice,
  sellPrice,
  TAG_TRAITS,
} from "../game/rules.js";
import {
  getDestinations,
  getFloorStatus,
  getForgeOptions,
  getHealItems,
  getRopeCount,
  getShop,
  healAmount,
} from "../game/selectors.js";
import { getEffect, getRank, isTechnique, SKILLS } from "../game/skills.js";
import { button, esc, meter, num, pips, timeAgo } from "./html.js";

const EVENT_HINTS = {
  mercader: "Puedes comerciar con él mientras sigas en este piso.",
  patrulla: "Hay un combate más de lo normal, pero la patrulla lleva el doble de oro.",
  altar: "Puedes rezar una vez para recuperar salud y toda la energía.",
  magia: "Los enemigos de este piso son más fuertes y dan más experiencia y oro.",
};

function welcomeWord(state) {
  switch (state.player.gender) {
    case "femenino":
      return "Bienvenida";
    case "masculino":
      return "Bienvenido";
    default:
      return "Te damos la bienvenida";
  }
}

function dangerTag(danger) {
  return `<span class="tag tag--${danger.id}" title="Estimación con ataques básicos y sin curarte">${esc(danger.name)}</span>`;
}

function noticeHtml(notice) {
  if (!notice) {
    return "";
  }
  if (notice.type === "victory") {
    const loot = notice.loot
      .map((drop) => `${esc(drop.label)}${drop.equipped ? " <em>(equipado)</em>" : ""}`)
      .join(", ");
    return (
      `<div class="notice notice--good" role="status">` +
      `<strong>Victoria contra ${esc(notice.title)}</strong>` +
      `<span>+${num(notice.xp)} de experiencia · +${num(notice.gold)} de oro</span>` +
      (loot ? `<span>Botín: ${loot}</span>` : "") +
      (notice.levels ? `<span class="notice__level">¡Subes de nivel! Tienes puntos de habilidad por gastar.</span>` : "") +
      "</div>"
    );
  }
  return `<div class="notice notice--${esc(notice.tone || "info")}" role="status">${esc(notice.text)}</div>`;
}

function healButtons(state, action) {
  const stats = getPlayerStats(state);
  const full = state.player.hp >= state.player.maxHp;
  return getHealItems(state)
    .map(({ entry, item }) =>
      button(item.name, action, {
        data: action === "act" ? { type: "item", key: entryKey(entry) } : { key: entryKey(entry) },
        note: `+${num(healAmount(item, stats))} salud · ×${entry.qty}`,
        disabled: full,
      })
    )
    .join("");
}

// --- Pantallas sin partida ---

export function titleScreen({ saved, storageAvailable, message }) {
  const summary = saved
    ? `Partida guardada: <strong>${esc(saved.player.name)}</strong> · nivel ${saved.player.level} · ` +
      `${saved.player.floor > 0 ? `piso ${saved.player.floor}` : "en Rubi"} · ` +
      `piso más alto ${saved.progress.maxFloor || 0} · ${esc(timeAgo(saved.meta.updatedAt))}.`
    : "Aún no hay ninguna partida guardada en este navegador.";
  return (
    `<h2>Bienvenido</h2>` +
    `<p>Rubi vive a la sombra de un castillo de 100 pisos. Sube piso a piso, vence a sus cinco jefes ` +
    `y vuelve a la ciudad para descansar y mejorar tu equipo. Elige comenzar una nueva partida o continuar tu progreso.</p>` +
    (message ? `<div class="notice notice--bad" role="alert">${esc(message)}</div>` : "") +
    `<div class="panel__actions" data-hotkeys>` +
    `<button type="button" class="btn btn--primary" id="newGameBtn" data-action="new-game"><span class="btn__label">Nueva partida</span></button>` +
    `<button type="button" class="btn ${saved ? "" : "btn--ghost"}" id="continueBtn" data-action="continue"${saved ? "" : " disabled"}><span class="btn__label">Continuar</span></button>` +
    `</div>` +
    `<p class="hint">${summary}</p>` +
    (storageAvailable
      ? ""
      : `<p class="hint hint--warn">Este navegador no permite guardar datos: la partida se perderá al cerrar la página.</p>`)
  );
}

export function newGameScreen({ saved }) {
  return (
    `<h2>Nueva partida</h2>` +
    `<form class="form" data-form="new-game" autocomplete="off">` +
    `<fieldset class="field"><legend>Nombre</legend>` +
    `<input type="text" name="name" maxlength="24" placeholder="Aventurero" aria-label="Nombre del personaje" /></fieldset>` +
    `<fieldset class="field"><legend>Personaje</legend>` +
    `<label><input type="radio" name="gender" value="femenino" /> Aventurera</label>` +
    `<label><input type="radio" name="gender" value="masculino" /> Aventurero</label>` +
    `<label><input type="radio" name="gender" value="indefinido" checked /> Prefiero no decirlo</label></fieldset>` +
    `<details class="field field--details"><summary>Opciones avanzadas</summary>` +
    `<label class="field__stack">Semilla del castillo (opcional)` +
    `<input type="text" name="seed" maxlength="40" placeholder="Al azar" /></label>` +
    `<p class="hint">La misma semilla genera siempre los mismos pisos.</p></details>` +
    (saved
      ? `<p class="hint hint--warn">Ya hay una partida guardada de ${esc(saved.player.name)} (nivel ${saved.player.level}). Al comenzar se sustituirá.</p>`
      : "") +
    `<div class="panel__actions">` +
    `<button type="submit" class="btn btn--primary"><span class="btn__label">Comenzar</span></button>` +
    button("Volver", "back-title", { variant: "ghost" }) +
    `</div></form>`
  );
}

// --- Fin de partida ---

export function defeatScreen(state) {
  const { defeat } = state.flags;
  return (
    `<p class="eyebrow eyebrow--bad">Derrota</p>` +
    `<h2>Has caído</h2>` +
    `<p>${esc(defeat.by)} te vence en el piso ${defeat.floor}. Unos viajeros te recogen y despiertas en la posada de Rubi.</p>` +
    `<ul class="facts">` +
    `<li><span>Oro perdido</span><strong>${num(defeat.goldLost)}</strong></li>` +
    `<li><span>Conservas</span><strong>Nivel, equipo y objetos</strong></li>` +
    `<li><span>Vuelves a empezar desde</span><strong>Rubi o tu último refugio</strong></li>` +
    `</ul>` +
    `<div class="panel__actions" data-hotkeys>${button("Levantarse", "ack-defeat", { variant: "primary" })}</div>`
  );
}

export function victoryScreen(state) {
  const { stats, player } = state;
  return (
    `<p class="eyebrow eyebrow--good">Victoria</p>` +
    `<h2>El castillo de Rubi es tuyo</h2>` +
    `<p>El Rey de la catedral cae en el piso 100 y las campanas de Rubi repican por ${esc(player.name)}.</p>` +
    `<ul class="facts">` +
    `<li><span>Nivel</span><strong>${player.level}</strong></li>` +
    `<li><span>Combates ganados</span><strong>${num(stats.battles)}</strong></li>` +
    `<li><span>Enemigos vencidos</span><strong>${num(stats.kills)}</strong></li>` +
    `<li><span>Derrotas</span><strong>${num(stats.deaths)}</strong></li>` +
    `<li><span>Rondas de combate</span><strong>${num(stats.turns)}</strong></li>` +
    `<li><span>Oro ganado</span><strong>${num(stats.goldEarned)}</strong></li>` +
    `</ul>` +
    `<div class="panel__actions" data-hotkeys>` +
    button("Seguir explorando", "ack-victory", { variant: "primary" }) +
    `</div>`
  );
}

// --- Rubi ---

const DESTINATION_LABELS = {
  entrance: (floor) => `Entrada del castillo · piso ${floor}`,
  refuge: (floor) => `Refugio del piso ${floor}`,
  anchor: (floor) => `Subir por la cuerda · piso ${floor}`,
};

export function cityScreen(state, ui) {
  const { player, inventory } = state;
  const destinations = getDestinations(state).reverse();
  const [main, ...others] = destinations;
  const price = innPrice(player.level);
  const rested = player.hp >= player.maxHp && player.energy >= BALANCE.maxEnergy;
  const freeTarget = Math.round(player.maxHp * BALANCE.freeRestHeal);
  const label = (destination) => DESTINATION_LABELS[destination.kind](destination.floor);
  const otherButtons = others
    .map((destination) => button(label(destination), "enter", { data: { id: destination.id } }))
    .join("");

  return (
    `<p class="eyebrow">Ciudad fortificada</p>` +
    `<h2>Rubi</h2>` +
    `<p>${welcomeWord(state)}, ${esc(player.name)}. Aquí puedes descansar, comerciar y mejorar tu equipo antes de volver al castillo.</p>` +
    noticeHtml(ui.notice) +
    `<h3>Castillo</h3>` +
    `<div class="actions" data-hotkeys>` +
    button(label(main), "enter", { data: { id: main.id }, variant: "primary" }) +
    (others.length > 2 ? "" : otherButtons) +
    `</div>` +
    (others.length > 2
      ? `<details class="more"><summary>Otros destinos (${others.length})</summary><div class="actions">${otherButtons}</div></details>`
      : "") +
    `<h3>Ciudad</h3>` +
    `<div class="actions">` +
    button("Posada", "rest", {
      data: { kind: "inn" },
      note: rested ? "ya estás en forma" : `${num(price)} de oro`,
      disabled: rested || inventory.gold < price,
      title: "Recupera toda la salud y la energía",
    }) +
    button("Dormir al raso", "rest", {
      data: { kind: "free" },
      note: "gratis · hasta media salud",
      disabled: player.hp >= freeTarget,
    }) +
    button("Tienda", "view", { data: { view: "shop" }, note: "pociones y cuerdas" }) +
    button("Herrería", "view", { data: { view: "forge" }, note: "mejorar equipo" }) +
    `</div>`
  );
}

export function shopScreen(state) {
  const shop = getShop(state);
  const stats = getPlayerStats(state);
  const { gold, items } = state.inventory;
  const stock = shop.stock
    .map(({ item, price }) => {
      const owned = items.filter((entry) => entry.id === item.id).reduce((total, entry) => total + entry.qty, 0);
      return (
        `<li class="row"><div class="row__text"><strong>${esc(item.name)}</strong>` +
        `<small>${esc(describeItem(item, 0, stats.healBonus))} Tienes ${owned}.</small></div>` +
        button("Comprar", "buy", { data: { id: item.id }, note: `${num(price)} de oro`, disabled: gold < price, variant: "small" }) +
        `</li>`
      );
    })
    .join("");
  const sellable = items
    .map((entry) => {
      const item = getItem(entry.id);
      const price = sellPrice(item, entry.level, state.player.level, stats.goldBonus);
      return (
        `<li class="row"><div class="row__text"><strong>${esc(itemLabel(item, entry.level))} <span class="qty">×${entry.qty}</span></strong>` +
        `<small>${esc(describeItem(item, entry.level, stats.healBonus))}</small></div>` +
        button("Vender", "sell", { data: { key: entryKey(entry) }, note: `+${num(price)} de oro`, variant: "small" }) +
        `</li>`
      );
    })
    .join("");

  return (
    `<p class="eyebrow">Comercio</p>` +
    `<h2>${esc(shop.name)}</h2>` +
    `<p>Tienes <strong class="gold">${num(gold)} de oro</strong>.${shop.markup > 1 ? " El mercader cobra un recargo por traer la mercancía hasta aquí." : ""}</p>` +
    `<h3>Comprar</h3><ul class="list">${stock}</ul>` +
    `<h3>Vender</h3>` +
    (sellable ? `<ul class="list">${sellable}</ul>` : `<p class="hint">No llevas nada que vender.</p>`) +
    `<div class="panel__actions">${button("Volver", "view", { data: { view: "" }, variant: "ghost" })}</div>`
  );
}

export function forgeScreen(state) {
  const { gold } = state.inventory;
  const rows = getForgeOptions(state)
    .map((option) => {
      let text;
      let action = "";
      if (option.piece) {
        text =
          `<strong>${esc(itemLabel(option.item, option.piece.level))}</strong>` +
          `<small>${esc(option.slot.name)} · ${esc(describeItem(option.item, option.piece.level))}</small>`;
        action = option.action
          ? button(`Mejorar a +${option.piece.level + 1}`, "forge", {
              data: { slot: option.slot.id },
              note: `${num(option.cost)} de oro`,
              disabled: gold < option.cost,
              variant: "small",
              title: describeItem(option.item, option.piece.level + 1),
            })
          : `<span class="hint">Al máximo</span>`;
      } else if (option.action === "buy") {
        text =
          `<strong>${esc(option.slot.name)}: vacío</strong>` +
          `<small>La herrera puede forjarte: ${esc(option.item.name)} (${esc(describeItem(option.item, 0))}).</small>`;
        action = button("Forjar", "forge", {
          data: { slot: option.slot.id },
          note: `${num(option.cost)} de oro`,
          disabled: gold < option.cost,
          variant: "small",
        });
      } else {
        text =
          `<strong>${esc(option.slot.name)}: vacío</strong>` +
          `<small>${option.item ? "Ya llevas una pieza en la mochila: equípala desde el inventario." : "Esta pieza solo se consigue venciendo a un jefe."}</small>`;
      }
      return `<li class="row"><div class="row__text">${text}</div>${action}</li>`;
    })
    .join("");

  return (
    `<p class="eyebrow">Rubi</p>` +
    `<h2>Herrería</h2>` +
    `<p>Tienes <strong class="gold">${num(gold)} de oro</strong>. Cada mejora suma de nuevo la bonificación base de la pieza.</p>` +
    `<ul class="list">${rows}</ul>` +
    `<div class="panel__actions">${button("Volver", "view", { data: { view: "" }, variant: "ghost" })}</div>`
  );
}

// --- Castillo ---

function progressHtml(status) {
  const marks = Array.from(
    { length: status.total },
    (_, index) => `<i class="step${index < status.cleared ? " step--done" : ""}"></i>`
  ).join("");
  const boss = status.boss
    ? `<i class="step step--boss${status.bossPending ? "" : " step--done"}" title="Jefe"></i>`
    : "";
  const text = status.plan.safe
    ? "Refugio: aquí no hay enemigos"
    : `Encuentros ${status.cleared}/${status.total}` +
      (status.boss ? ` · Jefe: ${esc(status.boss.name)}${status.bossPending ? "" : " (vencido)"}` : "");
  return `<div class="progress"><span class="steps" aria-hidden="true">${marks}${boss}</span><span>${text}</span></div>`;
}

export function floorScreen(state, ui) {
  const status = getFloorStatus(state);
  const { plan } = status;
  const zone = getZoneForFloor(status.floor);
  const ropes = getRopeCount(state);
  const primary = [];
  const secondary = [];

  if (status.cleared < status.total) {
    primary.push(button("Explorar", "explore", { variant: "primary", note: "buscar el siguiente combate" }));
  } else if (status.bossReady) {
    const preview = createBossCombat({ boss: status.boss, floor: status.floor, difficulty: zone.difficulty });
    const danger = estimateDanger(getPlayerStats(state), state.player.hp, preview.enemies, true);
    primary.push(
      button(`Desafiar a ${status.boss.name}`, "boss", { variant: "primary", note: `peligro: ${danger.name.toLowerCase()}` })
    );
  } else if (status.canAscend) {
    primary.push(button(`Subir al piso ${status.floor + 1}`, "ascend", { variant: "primary" }));
  }

  if (plan.safe) {
    const rested = state.player.hp >= state.player.maxHp && state.player.energy >= BALANCE.maxEnergy;
    primary.push(
      button("Descansar en la hoguera", "rest", {
        data: { kind: "camp" },
        note: rested ? "ya estás en forma" : "salud y energía al máximo",
        disabled: rested,
      })
    );
  }
  if (plan.eventId === "altar") {
    primary.push(
      button("Rezar en el altar", "pray", {
        note: status.eventAvailable ? "+30 % de salud y energía" : "ya no responde",
        disabled: !status.eventAvailable,
      })
    );
  }
  if (plan.eventId === "mercader") {
    primary.push(button("Comerciar", "view", { data: { view: "shop" }, note: "mercader errante" }));
  }
  primary.push(healButtons(state, "use"));

  if (plan.safe) {
    secondary.push(button("Viajar a Rubi", "return", { data: { mode: "travel" }, note: "gratis · podrás volver aquí" }));
  } else {
    secondary.push(
      button("Bajar a Rubi con cuerda", "return", {
        data: { mode: "rope" },
        note: ropes > 0 ? `conservas este piso · ×${ropes}` : "no tienes cuerdas",
        disabled: ropes === 0,
      })
    );
    secondary.push(button("Retirarse a Rubi", "return", { data: { mode: "retreat" }, note: "pierdes la posición", variant: "ghost" }));
  }

  const harmless = plan.safe && (plan.eventId === "patrulla" || plan.eventId === "magia");
  const eventHint = harmless ? "Dentro del refugio no te afecta." : EVENT_HINTS[plan.eventId];
  const done = status.complete && !plan.safe;
  return (
    `<p class="eyebrow">${esc(zone.name)} · ${esc(zone.biome)}</p>` +
    `<h2>Piso ${status.floor}</h2>` +
    progressHtml(status) +
    `<p class="event"><strong>${esc(plan.event)}</strong> ${esc(eventHint)}</p>` +
    noticeHtml(ui.notice) +
    (done
      ? `<p class="hint">${status.isLastFloor ? "Has despejado la cima del castillo." : "Piso despejado: la escalera está libre."}</p>`
      : "") +
    `<div class="actions" data-hotkeys>${primary.join("")}</div>` +
    `<h3>Volver a la ciudad</h3>` +
    `<div class="actions">${secondary.join("")}</div>`
  );
}

function enemyHtml(enemy, index, isTarget) {
  const dead = enemy.hp <= 0;
  const traits = enemy.tags
    .map((tag) => TAG_TRAITS[tag])
    .filter(Boolean)
    .map((trait) => `<span class="chip" title="${esc(trait.hint)}">${esc(trait.name)}</span>`)
    .join("");
  return (
    `<li class="enemy${dead ? " enemy--dead" : ""}${isTarget ? " enemy--target" : ""}" data-enemy="${index}" data-hp="${enemy.hp}">` +
    `<div class="enemy__head"><strong>${esc(enemy.name)}</strong>${traits}` +
    (isTarget ? `<span class="chip chip--target">Objetivo</span>` : "") +
    `</div>` +
    meter(`enemy-${index}`, enemy.hp, enemy.maxHp, "enemy", `Salud de ${enemy.name}`) +
    `<small>${
      dead
        ? "Derrotado"
        : `<span class="enemy__word">Salud </span>${num(enemy.hp)}/${num(enemy.maxHp)} · Ataque ${num(enemy.attack)}`
    }</small>` +
    `</li>`
  );
}

export function combatScreen(state) {
  const { combat, player, skills } = state;
  const stats = getPlayerStats(state);
  const isBoss = combat.kind === "boss";
  const danger = estimateDanger(stats, player.hp, combat.enemies, isBoss);
  const targetIndex = combat.enemies.findIndex((enemy) => enemy.hp > 0);
  const blast = isBlastIncoming(combat);

  const techniques = SKILLS.filter((skill) => isTechnique(skill) && getRank(skills, skill.id) > 0)
    .map((skill) => {
      const effect = getEffect(skills, skill.id);
      const note =
        skill.id === "aliento"
          ? `+${num(player.maxHp * effect.heal)} salud`
          : `${Math.round(effect.multiplier * 100)} % de daño${skill.id === "barrido" ? " a todos" : ""}`;
      return button(skill.name, "act", {
        data: { type: "skill", id: skill.id },
        note: `${note} · coste ${skill.cost}`,
        disabled: player.energy < skill.cost || (skill.id === "aliento" && player.hp >= player.maxHp),
        variant: "skill",
      });
    })
    .join("");

  const feed = combat.feed.length
    ? combat.feed.map((event) => `<li class="feed__item feed__item--${esc(event.tone)}">${esc(event.text)}</li>`).join("")
    : `<li class="feed__item">${isBoss ? "El jefe te mide con la mirada." : "Los enemigos te cortan el paso."} Te toca a ti.</li>`;

  return (
    `<p class="eyebrow">Combate · piso ${combat.floor} · ronda ${combat.round}</p>` +
    `<h2>${esc(combat.title)} ${dangerTag(danger)}</h2>` +
    `<ul class="enemies">${combat.enemies.map((enemy, index) => enemyHtml(enemy, index, index === targetIndex)).join("")}</ul>` +
    (blast
      ? `<div class="notice notice--warn" role="alert"><strong>Golpe devastador inminente.</strong><span>Defiéndete esta ronda para bloquear gran parte del daño y ganar energía.</span></div>`
      : "") +
    `<ul class="feed" aria-live="polite">${feed}</ul>` +
    `<div class="you" data-hp="${player.hp}">` +
    `<div class="you__line"><strong>${esc(player.name)}</strong><span>Salud ${num(player.hp)}/${num(player.maxHp)}</span></div>` +
    meter("player-hp", player.hp, player.maxHp, "hp", "Tu salud") +
    `<div class="you__line"><span>Energía ${player.energy}/${BALANCE.maxEnergy}</span>${pips(player.energy, BALANCE.maxEnergy, "energy")}</div>` +
    `</div>` +
    `<div class="actions actions--combat" data-hotkeys>` +
    button("Atacar", "act", { data: { type: "attack" }, variant: blast ? "" : "primary", note: "golpe básico" }) +
    button("Defender", "act", {
      data: { type: "defend" },
      variant: blast ? "primary" : "",
      note: `bloquea el ${Math.round(stats.block * 100)} %`,
    }) +
    techniques +
    healButtons(state, "act") +
    (isBoss
      ? ""
      : button("Huir", "act", {
          data: { type: "flee" },
          variant: "ghost",
          note: `${Math.round(BALANCE.fleeChance * 100)} % de éxito`,
        })) +
    `</div>` +
    (techniques
      ? ""
      : `<p class="hint">Aún no conoces ninguna técnica: gasta puntos en la pestaña Habilidades.</p>`)
  );
}
