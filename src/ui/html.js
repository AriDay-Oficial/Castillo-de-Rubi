const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function num(value) {
  return Math.round(value).toLocaleString("es-ES");
}

export function percent(value, total) {
  if (!total) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export function timeAgo(iso, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(seconds)) {
    return "en fecha desconocida";
  }
  if (seconds < 10) {
    return "hace un momento";
  }
  if (seconds < 60) {
    return `hace ${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `hace ${hours} h`;
  }
  return `hace ${Math.round(hours / 24)} días`;
}

function dataAttributes(data) {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ` data-${key}="${esc(value)}"`)
    .join("");
}

/**
 * Botón de acción. `data` viaja como atributos data-* hasta el manejador;
 * `note` es el texto pequeño de la derecha (coste, cantidad…) e `icon`, el
 * HTML de un sprite que acompaña a la etiqueta.
 */
export function button(label, action, { data = {}, variant = "", disabled = false, note = "", title = "", icon = "" } = {}) {
  const classes = ["btn", ...variant.split(" ").filter(Boolean).map((name) => `btn--${name}`)];
  return (
    `<button type="button" class="${classes.join(" ")}" data-action="${esc(action)}"` +
    dataAttributes(data) +
    (title ? ` title="${esc(title)}"` : "") +
    (disabled ? " disabled" : "") +
    `><span class="btn__label">${icon}${esc(label)}</span>` +
    (note ? `<span class="btn__note">${esc(note)}</span>` : "") +
    "</button>"
  );
}

/** Barra de progreso. `id` permite animarla entre un render y el siguiente. */
export function meter(id, value, total, kind, label = "") {
  return (
    `<div class="meter meter--${kind}" role="img" aria-label="${esc(label)}">` +
    `<span class="meter__fill" data-meter="${esc(id)}" data-value="${percent(value, total)}" ` +
    `style="width:${percent(value, total)}%"></span></div>`
  );
}

export function pips(filled, total, kind) {
  return (
    `<span class="pips pips--${kind}" aria-hidden="true">` +
    Array.from(
      { length: total },
      (_, index) => `<i class="pip${index < filled ? " pip--on" : ""}"></i>`
    ).join("") +
    "</span>"
  );
}
