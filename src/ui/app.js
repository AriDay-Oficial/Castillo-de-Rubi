import { createEngine } from "../core/engine.js";
import { createNewGame } from "../core/state.js";
import { exportSave, importSave } from "../core/storage.js";
import { createGame } from "../game/game.js";
import { BALANCE, xpToNext } from "../game/rules.js";
import { getShop, isInCity } from "../game/selectors.js";
import { esc, meter, num, percent } from "./html.js";
import {
  cityScreen,
  combatScreen,
  defeatScreen,
  floorScreen,
  forgeScreen,
  newGameScreen,
  shopScreen,
  titleScreen,
  victoryScreen,
} from "./screens.js";
import { inventoryScreen, settingsScreen, skillsScreen } from "./tabs.js";

const TOAST_MS = 2800;
const TOAST_TONES = { good: "good", bad: "bad", loot: "good" };
// Acciones cuyo resultado se anuncia con un aviso flotante: en móvil la
// bitácora queda fuera de la vista.
const ANNOUNCED = new Set(["rest", "pray", "buy", "sell", "forge", "equip", "unequip", "use", "learn", "return"]);

export function createApp({ doc = document, bus, storage }) {
  const els = {
    app: doc.getElementById("app"),
    screen: doc.getElementById("screen"),
    status: doc.getElementById("statusBar"),
    log: doc.getElementById("logList"),
    toasts: doc.getElementById("toasts"),
    modal: doc.getElementById("modal"),
    tabs: [...doc.querySelectorAll("[data-tab]")],
  };

  let session = null;
  let saved = storage.load();
  let renderQueued = false;
  let lastScreen = null;
  let saveWarned = false;
  let meterValues = new Map();
  let hpValues = new Map();
  const ui = {
    tab: "explore",
    screen: "title",
    view: "",
    notice: null,
    confirm: null,
    transfer: null,
    savedAt: null,
    message: null,
  };

  const getState = () => (session ? session.engine.getState() : null);

  // --- Avisos ---

  function toast(text, tone = "info") {
    const item = doc.createElement("div");
    item.className = `toast toast--${tone}`;
    item.textContent = text;
    els.toasts.append(item);
    while (els.toasts.children.length > 2) {
      els.toasts.firstElementChild.remove();
    }
    setTimeout(() => item.remove(), TOAST_MS);
  }

  function ask(message, confirmLabel, onConfirm, tone = "primary") {
    ui.confirm = { message, confirmLabel, onConfirm, tone };
    scheduleRender();
  }

  // --- Partida ---

  function persist() {
    const state = getState();
    if (!state) {
      return;
    }
    if (storage.save(state)) {
      ui.savedAt = new Date().toISOString();
    } else if (storage.available && !saveWarned) {
      saveWarned = true;
      toast("No se ha podido guardar la partida en este navegador.", "bad");
    }
  }

  function openSession(state, { fresh = false } = {}) {
    const engine = createEngine(state, bus);
    const game = createGame({ engine, bus });
    session = { engine, game };
    Object.assign(ui, { tab: "explore", screen: null, view: "", notice: null, transfer: null, message: null });
    if (fresh) {
      game.start();
    }
    persist();
    scheduleRender();
  }

  function closeSession() {
    session = null;
    saved = storage.load();
    Object.assign(ui, { tab: "explore", screen: "title", view: "", notice: null, transfer: null });
    scheduleRender();
  }

  function startNewGame(form) {
    const data = new FormData(form);
    const begin = () =>
      openSession(
        createNewGame({ name: data.get("name"), gender: data.get("gender"), seed: data.get("seed") }),
        { fresh: true }
      );
    if (saved) {
      ask(
        `Se sustituirá la partida guardada de ${saved.player.name} (nivel ${saved.player.level}). ¿Comenzar de nuevo?`,
        "Comenzar",
        begin
      );
    } else {
      begin();
    }
  }

  function loadImported(form) {
    const state = importSave(new FormData(form).get("code"));
    if (!state) {
      toast("Ese código no contiene una partida válida.", "bad");
      return;
    }
    const load = () => {
      openSession(state);
      toast(`Partida de ${state.player.name} cargada.`, "good");
    };
    if (session || saved) {
      ask("La partida importada sustituirá a la que hay guardada en este navegador. ¿Cargarla?", "Cargar", load);
    } else {
      load();
    }
  }

  // --- Acciones de la interfaz ---

  function play(name, call) {
    const before = getState().log[0];
    ui.notice = name === "learn" || name === "equip" || name === "unequip" ? ui.notice : null;
    const result = call(session.game);
    if (!result.ok) {
      toast(result.reason, "bad");
      scheduleRender();
      return;
    }
    const newest = getState().log[0];
    // En pantallas anchas la bitácora queda a la vista: repetirla en un aviso solo estorba.
    const logInView = doc.defaultView.matchMedia?.("(min-width: 900px)").matches;
    if (ANNOUNCED.has(name) && !logInView && newest !== before && typeof newest === "object") {
      toast(newest.text, TOAST_TONES[newest.kind] || "info");
    }
    scheduleRender();
  }

  const actions = {
    "new-game": () => {
      Object.assign(ui, { tab: "explore", screen: "new-game" });
    },
    "back-title": () => {
      ui.screen = "title";
    },
    continue: () => {
      const state = storage.load();
      if (state) {
        openSession(state);
      } else {
        saved = null;
        ui.message = "No se ha encontrado ninguna partida guardada que se pueda cargar.";
      }
    },
    view: ({ view }) => {
      ui.view = view || "";
    },
    enter: ({ id }) => play("enter", (game) => game.enterCastle(id)),
    explore: () => play("explore", (game) => game.explore()),
    boss: () => play("boss", (game) => game.challengeBoss()),
    ascend: () => play("ascend", (game) => game.ascend()),
    act: ({ type, id, key }) => play("act", (game) => game.act({ type, id, key })),
    rest: ({ kind }) => play("rest", (game) => game.rest(kind)),
    pray: () => play("pray", (game) => game.pray()),
    buy: ({ id }) => play("buy", (game) => game.buy(id)),
    sell: ({ key }) => play("sell", (game) => game.sell(key)),
    forge: ({ slot }) => play("forge", (game) => game.forge(slot)),
    equip: ({ key }) => play("equip", (game) => game.equip(key)),
    unequip: ({ slot }) => play("unequip", (game) => game.unequip(slot)),
    use: ({ key, slot }) => play("use", (game) => game.useItem(key, slot)),
    learn: ({ id }) => play("learn", (game) => game.learnSkill(id)),
    return: ({ mode }) => {
      const go = () => {
        ui.tab = "explore";
        play("return", (game) => game.returnToCity(mode));
      };
      if (mode === "retreat") {
        ask(
          "Si te retiras sin cuerda perderás tu posición: tendrás que volver a subir desde la entrada o desde tu último refugio.",
          "Retirarse",
          go
        );
      } else {
        go();
      }
    },
    "ack-defeat": () => play("ack", (game) => game.acknowledge("defeat")),
    "ack-victory": () => play("ack", (game) => game.acknowledge("victoryPending")),
    save: () => {
      persist();
      toast("Partida guardada.", "good");
    },
    "transfer-export": () => {
      ui.transfer = { mode: "export", code: exportSave(getState()) };
    },
    "transfer-import": () => {
      ui.transfer = { mode: "import" };
    },
    "transfer-close": () => {
      ui.transfer = null;
    },
    "copy-export": () => {
      const field = els.screen.querySelector('[data-role="export-code"]');
      field?.select();
      const copied = doc.defaultView.navigator.clipboard?.writeText(ui.transfer.code);
      if (copied) {
        copied.then(
          () => toast("Código copiado al portapapeles.", "good"),
          () => toast("No se pudo copiar: selecciona el texto y cópialo a mano.", "bad")
        );
      } else {
        toast("Selecciona el texto y cópialo a mano.", "info");
      }
    },
    quit: () => {
      persist();
      closeSession();
    },
    "delete-save": () => {
      ask(
        "Se borrará la partida guardada y no se podrá recuperar. ¿Borrarla?",
        "Borrar partida",
        () => {
          storage.clear();
          closeSession();
          toast("Partida borrada.", "info");
        },
        "danger"
      );
    },
    "confirm-yes": () => {
      const { onConfirm } = ui.confirm;
      ui.confirm = null;
      onConfirm();
    },
    "confirm-no": () => {
      ui.confirm = null;
    },
  };

  // --- Pintado ---

  function pickScreen(state) {
    if (ui.tab === "settings") {
      return ["settings", settingsScreen(state, ui, { storageAvailable: storage.available })];
    }
    if (!state) {
      return ui.screen === "new-game"
        ? ["new-game", newGameScreen({ saved })]
        : ["title", titleScreen({ saved, storageAvailable: storage.available, message: ui.message })];
    }
    if (ui.tab === "inventory") {
      return ["inventory", inventoryScreen(state)];
    }
    if (ui.tab === "skills") {
      return ["skills", skillsScreen(state)];
    }
    if (state.flags.victoryPending) {
      return ["victory", victoryScreen(state)];
    }
    if (state.flags.defeat) {
      return ["defeat", defeatScreen(state)];
    }
    if (state.combat) {
      return ["combat", combatScreen(state)];
    }
    if (ui.view === "shop" && getShop(state)) {
      return ["shop", shopScreen(state)];
    }
    if (isInCity(state)) {
      return ui.view === "forge" ? ["forge", forgeScreen(state)] : ["city", cityScreen(state, ui)];
    }
    return [`floor-${state.player.floor}`, floorScreen(state, ui)];
  }

  function renderStatus(state) {
    if (!state) {
      els.status.innerHTML = `<span class="badge">Sin partida en curso</span>`;
      return;
    }
    const { player, inventory } = state;
    const health = percent(player.hp, player.maxHp);
    const need = xpToNext(player.level);
    els.status.innerHTML =
      `<span class="badge">${player.floor > 0 ? `Piso ${player.floor}` : "Rubi"}</span>` +
      `<span class="badge">Nivel ${player.level}</span>` +
      `<span class="badge badge--hp${health <= 30 ? " badge--low" : ""}">Salud ${health}%</span>` +
      `<span class="badge badge--energy">Energía ${player.energy}/${BALANCE.maxEnergy}</span>` +
      `<span class="badge badge--gold">Oro ${num(inventory.gold)}</span>` +
      `<div class="status__meters">` +
      meter("status-hp", player.hp, player.maxHp, "hp", `Salud ${player.hp} de ${player.maxHp}`) +
      meter("status-xp", player.xp, need, "xp", `Experiencia ${player.xp} de ${need}`) +
      `</div>`;
  }

  function renderTabs(state) {
    for (const tab of els.tabs) {
      const name = tab.dataset.tab;
      const active = name === ui.tab;
      tab.classList.toggle("tab--active", active);
      tab.setAttribute("aria-current", active ? "page" : "false");
      tab.disabled = !state && (name === "inventory" || name === "skills");
      const points = name === "skills" && state ? state.player.skillPoints : 0;
      if (points > 0) {
        tab.dataset.badge = points;
      } else {
        delete tab.dataset.badge;
      }
    }
  }

  function renderLog(state) {
    if (!state) {
      els.log.innerHTML = "<li>El castillo aguarda...</li>";
      return;
    }
    els.log.innerHTML = state.log
      .map((entry) => {
        const text = typeof entry === "string" ? entry : entry.text;
        const kind = typeof entry === "string" ? "info" : entry.kind;
        return `<li class="log__item log__item--${esc(kind)}">${esc(text)}</li>`;
      })
      .join("");
  }

  function renderModal() {
    if (!ui.confirm) {
      els.modal.hidden = true;
      els.modal.innerHTML = "";
      return;
    }
    const { message, confirmLabel, tone } = ui.confirm;
    els.modal.hidden = false;
    els.modal.innerHTML =
      `<div class="modal__box" role="alertdialog" aria-modal="true" aria-label="Confirmación">` +
      `<p>${esc(message)}</p><div class="panel__actions">` +
      `<button type="button" class="btn btn--${esc(tone)}" data-action="confirm-yes"><span class="btn__label">${esc(confirmLabel)}</span></button>` +
      `<button type="button" class="btn btn--ghost" data-action="confirm-no"><span class="btn__label">Cancelar</span></button>` +
      `</div></div>`;
    els.modal.querySelector('[data-action="confirm-no"]').focus();
  }

  // Las barras arrancan en su valor anterior y transicionan al nuevo.
  function animateMeters() {
    const next = new Map();
    for (const fill of doc.querySelectorAll("[data-meter]")) {
      const id = fill.dataset.meter;
      const value = fill.dataset.value;
      const previous = meterValues.get(id);
      if (previous !== undefined && previous !== value) {
        fill.style.width = `${previous}%`;
        void fill.offsetWidth;
        fill.style.width = `${value}%`;
      }
      next.set(id, value);
    }
    meterValues = next;
  }

  function flashDamage() {
    const next = new Map();
    for (const node of els.screen.querySelectorAll("[data-hp]")) {
      const id = node.dataset.enemy ?? "you";
      const hp = Number(node.dataset.hp);
      const previous = hpValues.get(id);
      if (previous !== undefined && hp < previous) {
        node.classList.add("is-hit");
      }
      next.set(id, hp);
    }
    hpValues = next;
  }

  function labelHotkeys() {
    hotkeyButtons().forEach((node, index) => {
      if (index < 9) {
        node.insertAdjacentHTML("beforeend", `<kbd>${index + 1}</kbd>`);
      }
    });
  }

  function hotkeyButtons() {
    return [...els.screen.querySelectorAll("[data-hotkeys] button")];
  }

  function focusKey(node) {
    return node?.dataset?.action ? JSON.stringify(node.dataset) : null;
  }

  function render() {
    renderQueued = false;
    const state = getState();
    if (state) {
      if (ui.view === "shop" && !getShop(state)) {
        ui.view = "";
      }
      if (ui.view === "forge" && (!isInCity(state) || state.combat)) {
        ui.view = "";
      }
    }
    const [name, html] = pickScreen(state);
    const focused = els.screen.contains(doc.activeElement) ? focusKey(doc.activeElement) : null;

    renderStatus(state);
    renderTabs(state);
    renderLog(state);
    els.screen.innerHTML = html;
    els.screen.dataset.screen = name.replace(/-\d+$/, "");
    els.app.dataset.screen = els.screen.dataset.screen;
    labelHotkeys();
    animateMeters();
    flashDamage();
    renderModal();

    if (name !== lastScreen) {
      lastScreen = name;
      if (els.screen.getBoundingClientRect().top < 0) {
        els.screen.scrollIntoView({ block: "start" });
      }
      els.screen.querySelector("input[type=text]")?.focus({ preventScroll: true });
    } else if (focused && !ui.confirm) {
      const again = [...els.screen.querySelectorAll("[data-action]")].find(
        (node) => focusKey(node) === focused && !node.disabled
      );
      again?.focus({ preventScroll: true });
    }
  }

  function scheduleRender() {
    if (!renderQueued) {
      renderQueued = true;
      queueMicrotask(render);
    }
  }

  // --- Eventos ---

  bus.on("state:changed", () => {
    persist();
    scheduleRender();
  });
  bus.on("combat:started", () => {
    Object.assign(ui, { tab: "explore", view: "", notice: null });
  });
  bus.on("combat:won", (summary) => {
    ui.notice = { type: "victory", ...summary };
    ui.tab = "explore";
  });
  bus.on("combat:lost", () => {
    Object.assign(ui, { tab: "explore", view: "", notice: null });
  });
  bus.on("player:levelup", ({ level, points }) => {
    toast(`¡Nivel ${level}!${points > 0 ? " Tienes puntos de habilidad por gastar." : ""}`, "good");
  });

  doc.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab && !tab.disabled) {
      ui.tab = tab.dataset.tab;
      ui.transfer = null;
      scheduleRender();
      return;
    }
    const node = event.target.closest("[data-action]");
    if (!node || node.disabled) {
      return;
    }
    const handler = actions[node.dataset.action];
    if (handler) {
      handler({ ...node.dataset });
      scheduleRender();
    }
  });

  doc.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-form]");
    if (!form) {
      return;
    }
    event.preventDefault();
    if (form.dataset.form === "new-game") {
      startNewGame(form);
    } else if (form.dataset.form === "import") {
      loadImported(form);
    }
  });

  doc.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (ui.confirm) {
      if (event.key === "Escape") {
        ui.confirm = null;
        scheduleRender();
      }
      return;
    }
    if (event.target.closest("input, textarea, select")) {
      return;
    }
    // Hay teclado: enseña los números de atajo aunque el navegador no declare un ratón.
    els.app.classList.add("app--keys");
    if (/^[1-9]$/.test(event.key)) {
      const target = hotkeyButtons()[Number(event.key) - 1];
      if (target && !target.disabled) {
        event.preventDefault();
        target.click();
      }
    }
  });

  doc.defaultView.addEventListener("pagehide", persist);

  render();

  return {
    getState,
    render,
  };
}
