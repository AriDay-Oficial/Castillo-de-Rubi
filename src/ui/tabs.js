import { describeItem, entryKey, getItem, itemLabel, MAX_GEAR_LEVEL, RARITY_NAMES, SLOTS } from "../game/items.js";
import { BALANCE, getPlayerStats, xpToNext } from "../game/rules.js";
import { getFloorStatus, isInCity } from "../game/selectors.js";
import { getRank, openRanks, SKILL_GROUPS, SKILL_MAX_RANK, SKILLS } from "../game/skills.js";
import { button, esc, meter, num, timeAgo } from "./html.js";
import { itemSprite } from "./sprites.js";

export function inventoryScreen(state) {
  const { inventory, equipment, combat } = state;
  const stats = getPlayerStats(state);
  const cores = inventory.items.filter((entry) => getItem(entry.id)?.kind === "upgrade");
  const core = cores[0];
  const inCastle = !isInCity(state);
  const onSafeFloor = inCastle && getFloorStatus(state).plan.safe;

  const gear = SLOTS.map((slot) => {
    const piece = equipment[slot.id];
    if (!piece) {
      return `<li class="row"><div class="row__text"><strong>${esc(slot.name)}: vacío</strong><small>Sin bonificación.</small></div></li>`;
    }
    const item = getItem(piece.id);
    return (
      `<li class="row">${itemSprite(item.id)}<div class="row__text"><strong>${esc(itemLabel(item, piece.level))}</strong>` +
      `<small>${esc(slot.name)} · ${esc(RARITY_NAMES[item.rarity])} · ${esc(describeItem(item, piece.level))}</small></div>` +
      `<div class="row__actions">` +
      (core
        ? button("Usar núcleo", "use", {
            data: { key: entryKey(core), slot: slot.id },
            note: `+${getItem(core.id).levels} niveles`,
            disabled: Boolean(combat) || piece.level >= MAX_GEAR_LEVEL,
            variant: "small",
          })
        : "") +
      button("Quitar", "unequip", { data: { slot: slot.id }, disabled: Boolean(combat), variant: "small ghost" }) +
      `</div></li>`
    );
  }).join("");

  const bag = inventory.items
    .map((entry) => {
      const item = getItem(entry.id);
      let action = "";
      if (item.kind === "heal") {
        action = button("Usar", "use", {
          data: { key: entryKey(entry) },
          disabled: state.player.hp >= state.player.maxHp,
          note: combat ? "gasta la ronda" : "",
          variant: "small",
        });
      } else if (item.kind === "gear") {
        action = button("Equipar", "equip", { data: { key: entryKey(entry) }, disabled: Boolean(combat), variant: "small" });
      } else if (item.kind === "rope") {
        action = button("Bajar a Rubi", "return", {
          data: { mode: "rope" },
          disabled: Boolean(combat) || !inCastle || onSafeFloor,
          variant: "small",
        });
      }
      return (
        `<li class="row">${itemSprite(item.id)}<div class="row__text"><strong>${esc(itemLabel(item, entry.level))} <span class="qty">×${entry.qty}</span></strong>` +
        `<small>${esc(RARITY_NAMES[item.rarity])} · ${esc(describeItem(item, entry.level, stats.healBonus))}` +
        (item.kind === "upgrade" ? " Úsalo desde una pieza equipada." : "") +
        `</small></div>${action}</li>`
      );
    })
    .join("");

  return (
    `<p class="eyebrow">Mochila y equipo</p>` +
    `<h2>Inventario</h2>` +
    `<p>Llevas <strong class="gold">${num(inventory.gold)} de oro</strong>. El equipo te da ` +
    `+${num(stats.gear.attack)} de ataque y +${num(stats.gear.defense)} de defensa.</p>` +
    `<h3>Equipo</h3><ul class="list">${gear}</ul>` +
    `<h3>Mochila</h3>` +
    (bag ? `<ul class="list">${bag}</ul>` : `<p class="hint">La mochila está vacía.</p>`) +
    `<p class="hint">Los objetos se venden en la tienda de Rubi o a los mercaderes errantes.</p>`
  );
}

export function skillsScreen(state) {
  const { player, skills } = state;
  const stats = getPlayerStats(state);
  const need = xpToNext(player.level);
  const groups = SKILL_GROUPS.map((group) => {
    const rows = SKILLS.filter((skill) => skill.group === group.id)
      .map((skill) => {
        const rank = getRank(skills, skill.id);
        const maxed = rank >= SKILL_MAX_RANK;
        const current = rank > 0 ? skill.describe(skill.effect(rank)) : "Sin aprender.";
        const next = maxed ? "" : `<small class="row__next">Rango ${rank + 1}: ${esc(skill.describe(skill.effect(rank + 1)))}</small>`;
        return (
          `<li class="row"><div class="row__text">` +
          `<strong>${esc(skill.name)} <span class="qty">rango ${rank}/${SKILL_MAX_RANK}</span></strong>` +
          `<small>${esc(current)}</small>${next}</div>` +
          (maxed
            ? `<span class="hint">Al máximo</span>`
            : button(rank === 0 ? "Aprender" : "Mejorar", "learn", {
                data: { id: skill.id },
                disabled: player.skillPoints < 1,
                note: "1 punto",
                variant: "small",
              })) +
          `</li>`
        );
      })
      .join("");
    return `<h3>${esc(group.name)}</h3><p class="hint">${esc(group.hint)}</p><ul class="list">${rows}</ul>`;
  }).join("");

  return (
    `<p class="eyebrow">Personaje</p>` +
    `<h2>${esc(player.name)} · nivel ${player.level}</h2>` +
    `<div class="xp"><div class="you__line"><span>Experiencia</span><span>${num(player.xp)}/${num(need)}</span></div>` +
    meter("sheet-xp", player.xp, need, "xp", "Experiencia") +
    `</div>` +
    `<ul class="facts">` +
    `<li><span>Salud</span><strong>${num(player.hp)}/${num(stats.maxHp)}</strong></li>` +
    `<li><span>Ataque</span><strong>${num(stats.attack)}</strong></li>` +
    `<li><span>Defensa</span><strong>${num(stats.defense)}</strong></li>` +
    `<li><span>Poder</span><strong>${num(stats.attack + stats.defense)}</strong></li>` +
    `<li><span>Crítico</span><strong>${Math.round(stats.critChance * 100)} %</strong></li>` +
    `<li><span>Energía</span><strong>${player.energy}/${BALANCE.maxEnergy}</strong></li>` +
    `</ul>` +
    (openRanks(skills) > 0
      ? `<p class="points${player.skillPoints > 0 ? " points--on" : ""}">Puntos de habilidad disponibles: <strong>${player.skillPoints}</strong>. Ganas uno por nivel.</p>`
      : `<p class="points">Dominas todas las habilidades.</p>`) +
    groups
  );
}

const HELP =
  `<details class="more"><summary>Cómo se juega</summary>` +
  `<ul class="help">` +
  `<li><strong>Objetivo:</strong> subir los 100 pisos y vencer al Rey de la catedral.</li>` +
  `<li><strong>Pisos:</strong> vence todos los encuentros (y al jefe, si lo hay) para abrir la escalera.</li>` +
  `<li><strong>Combate:</strong> por rondas. Atacas tú primero y después cada enemigo que siga en pie. ` +
  `El daño es ataque × ataque ÷ (ataque + defensa del rival).</li>` +
  `<li><strong>Energía:</strong> ganas 1 por cada enemigo que derribas y la gastas en técnicas.</li>` +
  `<li><strong>Jefes:</strong> cada cuatro rondas descargan un golpe devastador; avisan una ronda antes. Defiéndete.</li>` +
  `<li><strong>Rubi:</strong> en la ciudad descansas, compras y mejoras el equipo. Una cuerda te baja a Rubi y te deja volver al mismo piso; ` +
  `los refugios (pisos 11, 21, 31…) son puntos de viaje gratuitos.</li>` +
  `<li><strong>Derrota:</strong> despiertas en Rubi con la mitad del oro. No pierdes nivel ni objetos.</li>` +
  `<li><strong>Teclado:</strong> los números 1-9 pulsan las acciones principales en orden.</li>` +
  `</ul></details>`;

export function settingsScreen(state, ui, { storageAvailable }) {
  const transfer =
    (ui.transfer?.mode === "export"
      ? `<div class="transfer"><label class="field__stack">Código de tu partida` +
        `<textarea readonly rows="4" data-role="export-code">${esc(ui.transfer.code)}</textarea></label>` +
        `<div class="panel__actions">${button("Copiar", "copy-export", { variant: "small" })}${button("Cerrar", "transfer-close", { variant: "small ghost" })}</div></div>`
      : "") +
    (ui.transfer?.mode === "import"
      ? `<form class="transfer" data-form="import"><label class="field__stack">Pega aquí el código de una partida` +
        `<textarea name="code" rows="4" required></textarea></label>` +
        `<div class="panel__actions"><button type="submit" class="btn btn--small"><span class="btn__label">Cargar partida</span></button>` +
        `${button("Cancelar", "transfer-close", { variant: "small ghost" })}</div></form>`
      : "");

  if (!state) {
    return (
      `<p class="eyebrow">Opciones</p><h2>Ajustes</h2>` +
      `<p>No hay ninguna partida en curso. Puedes traer una desde otro navegador con su código.</p>` +
      `<div class="actions">${button("Importar partida", "transfer-import")}</div>` +
      transfer +
      HELP
    );
  }

  const { meta, player, stats } = state;
  return (
    `<p class="eyebrow">Opciones</p><h2>Ajustes</h2>` +
    `<ul class="facts">` +
    `<li><span>Personaje</span><strong>${esc(player.name)}</strong></li>` +
    `<li><span>Semilla</span><strong>${esc(meta.seed)}</strong></li>` +
    `<li><span>Empezada</span><strong>${esc(timeAgo(meta.createdAt))}</strong></li>` +
    `<li><span>Combates</span><strong>${num(stats.battles)}</strong></li>` +
    `<li><span>Derrotas</span><strong>${num(stats.deaths)}</strong></li>` +
    `<li><span>Piso más alto</span><strong>${num(state.progress.maxFloor || 0)}</strong></li>` +
    `</ul>` +
    (storageAvailable
      ? `<p class="hint">La partida se guarda sola en este navegador después de cada acción${ui.savedAt ? ` (último guardado ${esc(timeAgo(ui.savedAt))})` : ""}.</p>`
      : `<p class="hint hint--warn">Este navegador no permite guardar datos. Exporta la partida para no perderla.</p>`) +
    `<h3>Partida</h3>` +
    `<div class="actions">` +
    button("Guardar ahora", "save", { disabled: !storageAvailable }) +
    button("Exportar partida", "transfer-export", { note: "código para otro navegador" }) +
    button("Importar partida", "transfer-import", { note: "sustituye la actual" }) +
    button("Salir al menú", "quit", { variant: "ghost" }) +
    button("Borrar partida", "delete-save", { variant: "danger" }) +
    `</div>` +
    transfer +
    HELP
  );
}
