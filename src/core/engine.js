import { MAX_FLOOR } from "../content/floors.js";
import { touchState } from "./state.js";

const LOG_LIMIT = 50;

function mergeSlice(key) {
  return (state, payload) => ({
    ...state,
    [key]: {
      ...state[key],
      ...payload,
    },
  });
}

const reducers = {
  log(state, payload) {
    return {
      ...state,
      log: [payload, ...state.log].slice(0, LOG_LIMIT),
    };
  },
  updatePlayer: mergeSlice("player"),
  updateProgress: mergeSlice("progress"),
  updateInventory: mergeSlice("inventory"),
  updateEquipment: mergeSlice("equipment"),
  advanceFloor(state) {
    const current = state.player.floor;
    if (current >= MAX_FLOOR) {
      return state;
    }
    const cleared = state.progress.floorsCleared;
    return {
      ...state,
      player: {
        ...state.player,
        floor: current + 1,
      },
      progress: {
        ...state.progress,
        floorsCleared: cleared.includes(current) ? cleared : [...cleared, current],
        maxFloor: Math.max(state.progress.maxFloor || 0, current + 1),
      },
    };
  },
  setSkill(state, { group, id, rank }) {
    return {
      ...state,
      skills: {
        ...state.skills,
        [group]: {
          ...state.skills[group],
          [id]: rank,
        },
      },
    };
  },
  addStats(state, payload) {
    const stats = { ...state.stats };
    for (const [key, amount] of Object.entries(payload)) {
      stats[key] = (stats[key] || 0) + amount;
    }
    return { ...state, stats };
  },
  setFlag(state, { name, value }) {
    const flags = { ...state.flags };
    if (value === undefined || value === null) {
      delete flags[name];
    } else {
      flags[name] = value;
    }
    return { ...state, flags };
  },
  setRun(state, payload) {
    return { ...state, run: payload };
  },
  setCombat(state, payload) {
    return { ...state, combat: payload };
  },
};

export function createEngine(initialState, eventBus) {
  let state = initialState;
  let batchDepth = 0;
  let pendingEmit = false;

  function apply(type, payload) {
    if (!reducers[type]) {
      return state;
    }
    const next = reducers[type](state, payload);
    if (next === state) {
      return state;
    }
    state = touchState(next);
    if (batchDepth > 0) {
      pendingEmit = true;
    } else {
      eventBus.emit("state:changed", state);
    }
    return state;
  }

  /**
   * Agrupa varias acciones: los suscriptores reciben un único
   * "state:changed" al terminar, con el estado ya coherente.
   */
  function batch(work) {
    batchDepth += 1;
    try {
      return work();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && pendingEmit) {
        pendingEmit = false;
        eventBus.emit("state:changed", state);
      }
    }
  }

  function getState() {
    return state;
  }

  return {
    apply,
    batch,
    getState,
  };
}
