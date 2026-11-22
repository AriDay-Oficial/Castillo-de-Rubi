const percent = (value) => `${Math.round(value * 100)} %`;

export const SKILL_GROUPS = [
  { id: "weapons", name: "Armas", hint: "Técnicas de combate y maestrías." },
  { id: "craft", name: "Oficios", hint: "Ventajas fuera del combate." },
];

export const SKILL_MAX_RANK = 5;

// `effect(rango)` da los valores que usan las reglas; `describe` los explica.
export const SKILLS = [
  {
    id: "golpe",
    group: "weapons",
    name: "Golpe poderoso",
    cost: 1,
    effect: (rank) => ({ multiplier: 1.5 + 0.1 * rank }),
    describe: (effect) =>
      `Técnica (1 de energía): un ataque con el ${percent(effect.multiplier)} del daño.`,
  },
  {
    id: "barrido",
    group: "weapons",
    name: "Barrido",
    cost: 2,
    effect: (rank) => ({ multiplier: 0.6 + 0.08 * rank }),
    describe: (effect) =>
      `Técnica (2 de energía): golpea a todos los enemigos con el ${percent(effect.multiplier)} del daño.`,
  },
  {
    id: "aliento",
    group: "weapons",
    name: "Segundo aliento",
    cost: 3,
    effect: (rank) => ({ heal: 0.15 + 0.03 * rank }),
    describe: (effect) =>
      `Técnica (3 de energía): recuperas el ${percent(effect.heal)} de la salud máxima.`,
  },
  {
    id: "maestria",
    group: "weapons",
    name: "Maestría",
    effect: (rank) => ({ attack: 0.03 * rank, crit: 0.01 * rank }),
    describe: (effect) =>
      `Pasiva: +${percent(effect.attack)} de ataque y +${percent(effect.crit)} de probabilidad de crítico.`,
  },
  {
    id: "guardia",
    group: "weapons",
    name: "Guardia",
    effect: (rank) => ({ defense: 0.03 * rank, block: 0.5 + 0.05 * rank }),
    describe: (effect) =>
      `Pasiva: +${percent(effect.defense)} de defensa. Al defenderte bloqueas el ${percent(effect.block)} del daño.`,
  },
  {
    id: "alquimia",
    group: "craft",
    name: "Alquimia",
    effect: (rank) => ({ heal: 0.1 * rank }),
    describe: (effect) => `Pasiva: pociones y hierbas curan un ${percent(effect.heal)} más.`,
  },
  {
    id: "forja",
    group: "craft",
    name: "Forja",
    effect: (rank) => ({ discount: 0.06 * rank }),
    describe: (effect) =>
      `Pasiva: las mejoras de la herrería cuestan un ${percent(effect.discount)} menos.`,
  },
  {
    id: "comercio",
    group: "craft",
    name: "Comercio",
    effect: (rank) => ({ gold: 0.08 * rank }),
    describe: (effect) =>
      `Pasiva: obtienes un ${percent(effect.gold)} más de oro en combates y ventas.`,
  },
];

export function getSkill(id) {
  return SKILLS.find((skill) => skill.id === id);
}

export function isTechnique(skill) {
  return Number.isInteger(skill?.cost);
}

export function getRank(skills, id) {
  const skill = getSkill(id);
  if (!skill) {
    return 0;
  }
  const rank = skills?.[skill.group]?.[id];
  return Number.isInteger(rank) ? Math.min(SKILL_MAX_RANK, Math.max(0, rank)) : 0;
}

export function getEffect(skills, id) {
  return getSkill(id).effect(getRank(skills, id));
}
