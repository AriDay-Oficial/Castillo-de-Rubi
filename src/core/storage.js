import { normalizeState } from "./state.js";

export const SAVE_KEY = "castillo-de-rubi:partida";

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(code) {
  const binary = atob(code);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getDefaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Algunos navegadores lanzan al tocar localStorage con las cookies bloqueadas.
    return null;
  }
}

/** Código de texto para llevar la partida a otro navegador. */
export function exportSave(state) {
  return encodeBase64(JSON.stringify(state));
}

/** Devuelve la partida contenida en un código exportado, o null si no vale. */
export function importSave(code) {
  try {
    return normalizeState(JSON.parse(decodeBase64(String(code).trim())));
  } catch {
    return null;
  }
}

export function createStorage(backend = getDefaultBackend(), key = SAVE_KEY) {
  function save(state) {
    if (!backend) {
      return false;
    }
    try {
      backend.setItem(key, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    if (!backend) {
      return null;
    }
    try {
      const raw = backend.getItem(key);
      return raw ? normalizeState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function clear() {
    if (!backend) {
      return;
    }
    try {
      backend.removeItem(key);
    } catch {
      // Sin almacenamiento no hay nada que borrar.
    }
  }

  return {
    available: Boolean(backend),
    save,
    load,
    clear,
  };
}
