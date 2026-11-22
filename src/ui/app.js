import { createEngine } from "../core/engine.js";
import { createNewGame } from "../core/state.js";
import { exportSave, importSave } from "../core/storage.js";
import { createGame } from "../game/game.js";
import { BALANCE, xpToNext } from "../game/rules.js";
import { getShop, isInCity } from "../game/selectors.js";
import { COOLDOWN, createCooldowns } from "./cooldowns.js";
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

// Ritmo de los efectos de una ronda: primero golpea el jugador y después,
// escalonados, los enemigos.
const FX = { strikeStep: 90, enemyStart: 280, enemyStep: 150, goldMs: 500 };
const SHAKE = [
  { transform: "translateX(0)", filter: "brightness(1.7)" },
  { transform: "translateX(-4px)", offset: 0.3 },
  { transform: "translateX(3px)", offset: 0.6 },
  { transform: "translateX(0)", filter: "none" },
];
const FALLEN = "rotate(-90deg) translateX(-3px)";

/** Momento, en milisegundos desde el inicio de la ronda, en que se ve cada suceso. */
export function planRound(events) {
  let playerAt = 0;
  let enemyAt = FX.enemyStart;
  return events.map((event) => {
    if (event.source !== undefined) {
      const at = enemyAt;
      enemyAt += FX.enemyStep;
      return at;
    }
    const at = playerAt;
    if (typeof event.target === "number") {
      playerAt += FX.strikeStep;
    }
    return at;
  });
}

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

  const win = doc.defaultView;
  const now = () => win.performance.now();
  const motionOk = () => !win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const cooldowns = createCooldowns(now);

  let session = null;
  let saved = storage.load();
  let renderQueued = false;
  let lastScreen = null;
  let lastNav = null;
  let saveWarned = false;
  let meterValues = new Map();
  let shownState = null;
  let statusHtml = null;
  let statusSeen = null;
  let goldShown = null;
  let goldFrame = 0;
  let logSeen = null;
  let cooldownTimer = 0;
  let outroTimer = 0;
  const ui = {
    tab: "explore",
    screen: "title",
    view: "",
    notice: null,
    confirm: null,
    transfer: null,
    savedAt: null,
    message: null,
    outro: null,
    fx: null,
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

  function resetEffects() {
    win.clearTimeout(outroTimer);
    win.cancelAnimationFrame(goldFrame);
    cooldowns.clear();
    Object.assign(ui, { outro: null, fx: null });
    shownState = null;
    statusSeen = null;
    goldShown = null;
    logSeen = null;
    meterValues = new Map();
  }

  function openSession(state, { fresh = false } = {}) {
    resetEffects();
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
    resetEffects();
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

  function play(name, call, data) {
    const before = getState().log[0];
    ui.notice = name === "learn" || name === "equip" || name === "unequip" ? ui.notice : null;
    const result = call(session.game);
    if (!result.ok) {
      toast(result.reason, "bad");
      scheduleRender();
      return;
    }
    cooldowns.press(data);
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
    enter: (data) => play("enter", (game) => game.enterCastle(data.id), data),
    explore: (data) => play("explore", (game) => game.explore(), data),
    boss: (data) => play("boss", (game) => game.challengeBoss(), data),
    ascend: (data) => play("ascend", (game) => game.ascend(), data),
    act: (data) => play("act", (game) => game.act({ type: data.type, id: data.id, key: data.key }), data),
    rest: (data) => play("rest", (game) => game.rest(data.kind), data),
    pray: (data) => play("pray", (game) => game.pray(), data),
    buy: (data) => play("buy", (game) => game.buy(data.id), data),
    sell: (data) => play("sell", (game) => game.sell(data.key), data),
    forge: (data) => play("forge", (game) => game.forge(data.slot), data),
    equip: (data) => play("equip", (game) => game.equip(data.key), data),
    unequip: (data) => play("unequip", (game) => game.unequip(data.slot), data),
    use: (data) => play("use", (game) => game.useItem(data.key, data.slot), data),
    learn: (data) => play("learn", (game) => game.learnSkill(data.id), data),
    return: (data) => {
      const { mode } = data;
      const go = () => {
        ui.tab = "explore";
        play("return", (game) => game.returnToCity(mode), data);
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
    "ack-defeat": (data) => play("ack", (game) => game.acknowledge("defeat"), data),
    "ack-victory": (data) => play("ack", (game) => game.acknowledge("victoryPending"), data),
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
    if (ui.outro) {
      return ["combat", combatScreen(ui.outro.state, { outro: ui.outro.outcome })];
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

  function tweenGold(target) {
    win.cancelAnimationFrame(goldFrame);
    const from = goldShown;
    const start = now();
    const tick = () => {
      const node = els.status.querySelector("[data-gold]");
      const progress = Math.min(1, (now() - start) / FX.goldMs);
      goldShown = Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      if (node) {
        node.textContent = num(goldShown);
      }
      if (progress < 1 && node) {
        goldFrame = win.requestAnimationFrame(tick);
      } else {
        goldShown = target;
      }
    };
    tick();
  }

  function renderStatus(state) {
    if (!state) {
      statusHtml = `<span class="badge">Sin partida en curso</span>`;
      els.status.innerHTML = statusHtml;
      return;
    }
    const { player, inventory } = state;
    const health = percent(player.hp, player.maxHp);
    const need = xpToNext(player.level);
    const html =
      `<span class="badge">${player.floor > 0 ? `Piso ${player.floor}` : "Rubi"}</span>` +
      `<span class="badge" data-level>Nivel ${player.level}</span>` +
      `<span class="badge badge--hp${health <= 30 ? " badge--low" : ""}">Salud ${health}%</span>` +
      `<span class="badge badge--energy">Energía ${player.energy}/${BALANCE.maxEnergy}</span>` +
      `<span class="badge badge--gold">Oro <span data-gold>${num(inventory.gold)}</span></span>` +
      `<div class="status__meters">` +
      meter("status-hp", player.hp, player.maxHp, "hp", `Salud ${player.hp} de ${player.maxHp}`) +
      meter("status-xp", player.xp, need, "xp", `Experiencia ${player.xp} de ${need}`) +
      `</div>`;
    // Si nada cambia no se repinta, para no cortar las animaciones en curso.
    if (html === statusHtml) {
      return;
    }
    statusHtml = html;
    els.status.innerHTML = html;

    const seen = statusSeen;
    statusSeen = { level: player.level };
    if (seen && player.level > seen.level) {
      els.status.querySelector("[data-level]").classList.add("badge--levelup");
    }
    if (goldShown === null || !motionOk()) {
      goldShown = inventory.gold;
    } else if (goldShown !== inventory.gold) {
      if (inventory.gold > goldShown) {
        els.status.querySelector(".badge--gold").classList.add("badge--bump");
      }
      tweenGold(inventory.gold);
    }
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
    const { log } = state;
    // Las entradas solo se añaden por delante: si la primera no cambia, no hay nada nuevo.
    if (logSeen && logSeen === log[0]) {
      return;
    }
    const fresh = logSeen ? Math.max(0, log.indexOf(logSeen)) : 0;
    logSeen = log[0];
    els.log.innerHTML = log
      .map((entry, index) => {
        const text = typeof entry === "string" ? entry : entry.text;
        const kind = typeof entry === "string" ? "info" : entry.kind;
        return `<li class="log__item log__item--${esc(kind)}${index < fresh ? " log__item--new" : ""}">${esc(text)}</li>`;
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
  function animateMeters(delays = {}) {
    const next = new Map();
    for (const fill of doc.querySelectorAll("[data-meter]")) {
      const id = fill.dataset.meter;
      const value = fill.dataset.value;
      const previous = meterValues.get(id);
      if (previous !== undefined && previous !== value) {
        fill.style.width = `${previous}%`;
        void fill.offsetWidth;
        fill.style.transitionDelay = delays[id] ? `${delays[id]}ms` : "";
        fill.style.width = `${value}%`;
      }
      next.set(id, value);
    }
    meterValues = next;
  }

  function floatText(card, text, kind, at) {
    if (!card) {
      return;
    }
    const node = doc.createElement("span");
    node.className = `float float--${kind}`;
    node.textContent = text;
    node.setAttribute("aria-hidden", "true");
    node.style.animationDelay = `${at}ms`;
    node.style.setProperty("--x", `${card.querySelectorAll(".float").length * 22}px`);
    node.addEventListener("animationend", () => node.remove());
    card.append(node);
  }

  // Números flotantes, sacudidas y caídas de la ronda que se acaba de resolver.
  function playRound(events, times) {
    const lines = [...els.screen.querySelectorAll(".feed__item")];
    const you = els.screen.querySelector(".you");
    const hero = you?.querySelector(".sprite");
    const enemyCard = (index) => els.screen.querySelector(`[data-enemy="${index}"]`);
    let lastHurt = 0;

    events.forEach((event, index) => {
      const at = times[index];
      if (lines[index]) {
        lines[index].classList.add("feed__item--new");
        lines[index].style.animationDelay = `${at}ms`;
      }
      if (typeof event.target === "number") {
        const card = enemyCard(event.target);
        const sprite = card?.querySelector(".sprite");
        floatText(card, `−${num(event.amount)}`, event.crit ? "crit" : "dmg", at);
        card?.animate(SHAKE, { duration: event.crit ? 380 : 260, delay: at });
        hero?.animate([{ transform: "none" }, { transform: "translateY(-5px)" }, { transform: "none" }], {
          duration: 200,
          delay: at,
        });
        if (event.kill) {
          card?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0.45 }], {
            duration: 520,
            delay: at,
            fill: "backwards",
          });
          sprite?.animate(
            [
              { transform: "none", filter: "none" },
              { transform: "none", filter: "brightness(4)", offset: 0.3 },
              { transform: FALLEN, filter: "grayscale(1)" },
            ],
            { duration: 520, delay: at, fill: "backwards", easing: "ease-in" }
          );
        }
      } else if (event.target === "you" && event.source !== undefined) {
        lastHurt = at;
        floatText(you, `−${num(event.amount)}`, event.blast ? "crit" : "hurt", at);
        you?.animate(SHAKE, { duration: event.blast ? 420 : 260, delay: at });
        enemyCard(event.source)
          ?.querySelector(".sprite")
          ?.animate([{ transform: "none" }, { transform: "translateY(6px)" }, { transform: "none" }], {
            duration: 220,
            delay: at,
          });
      } else if (event.target === "you") {
        floatText(you, `+${num(event.amount)}`, "heal", at);
      } else if (event.tone === "miss") {
        floatText(enemyCard(event.source), "falla", "miss", at);
      }
    });

    if (you?.classList.contains("you--down")) {
      hero?.animate(
        [
          { transform: "none", filter: "none" },
          { transform: FALLEN, filter: "grayscale(1)" },
        ],
        { duration: 380, delay: lastHurt, fill: "backwards", easing: "ease-in" }
      );
    }
  }

  // --- Enfriamientos ---

  function applyCooldowns() {
    const at = now();
    for (const node of els.screen.querySelectorAll("button[data-action]")) {
      const cooling = node.disabled ? null : cooldowns.get(node.dataset, at);
      if (cooling) {
        node.classList.add("is-cooling");
        node.classList.remove("is-ready");
        node.setAttribute("aria-disabled", "true");
        node.style.setProperty("--cd-total", `${Math.round(cooling.total)}ms`);
        node.style.setProperty("--cd-elapsed", `${-Math.round(cooling.elapsed)}ms`);
      } else if (node.classList.contains("is-cooling")) {
        node.classList.remove("is-cooling");
        node.classList.add("is-ready");
        node.removeAttribute("aria-disabled");
      }
    }
    win.clearTimeout(cooldownTimer);
    const wait = cooldowns.next(at);
    if (wait !== null) {
      cooldownTimer = win.setTimeout(applyCooldowns, wait + 4);
    }
  }

  function startOutro(round) {
    const base = shownState || getState();
    ui.outro = {
      outcome: round.outcome,
      state: {
        ...base,
        combat: { ...round.combat, round: round.combat.round - 1 },
        player: { ...base.player, hp: round.hp, energy: round.energy },
      },
    };
    win.clearTimeout(outroTimer);
    outroTimer = win.setTimeout(() => {
      ui.outro = null;
      scheduleRender();
    }, COOLDOWN.outro);
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
    const entering = name !== lastScreen;
    const nav = `${ui.tab}|${ui.view}`;
    const outro = name === "combat" ? ui.outro : null;
    const round = name === "combat" ? ui.fx : null;
    const times = round ? planRound(round) : [];
    const hurtAt = round ? times.find((at, index) => round[index].target === "you" && round[index].source !== undefined) : 0;
    ui.fx = null;

    // Durante el desenlace la barra de estado sigue mostrando el combate.
    renderStatus(outro ? outro.state : state);
    renderTabs(state);
    renderLog(outro ? outro.state : state);
    els.screen.innerHTML = html;
    els.screen.dataset.screen = name.replace(/-\d+$/, "");
    els.app.dataset.screen = els.screen.dataset.screen;
    els.screen.classList.toggle("is-entering", entering);
    if (outro) {
      els.screen.dataset.outro = outro.outcome;
    } else {
      delete els.screen.dataset.outro;
    }
    labelHotkeys();
    animateMeters(hurtAt && motionOk() ? { "player-hp": hurtAt, "status-hp": hurtAt } : {});
    if (round && motionOk()) {
      playRound(round, times);
    }
    // Al llegar a una pantalla por una acción del juego (no al cambiar de
    // pestaña) sus botones empiezan enfriándose: evita encadenar pulsaciones.
    if (entering && state && nav === lastNav) {
      for (const node of els.screen.querySelectorAll("button[data-action]")) {
        cooldowns.arrive(node.dataset);
      }
    }
    lastNav = nav;
    shownState = state;
    applyCooldowns();
    renderModal();

    if (entering) {
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
  bus.on("combat:round", (round) => {
    ui.fx = round.events;
    if (round.outcome === "victory" || round.outcome === "defeat") {
      startOutro(round);
    }
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
    if (!node || node.disabled || node.getAttribute("aria-disabled") === "true" || node.closest("[inert]")) {
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
      if (target && !target.disabled && !ui.outro) {
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
