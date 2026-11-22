export const BOSSES = [
  {
    id: "guardian-del-bosque",
    name: "Guardián del bosque",
    floor: 10,
    power: 28,
  },
  {
    id: "reina-elemental",
    name: "Reina elemental",
    floor: 25,
    power: 48,
  },
  {
    id: "senor-de-cenizas",
    name: "Señor de cenizas",
    floor: 50,
    power: 65,
  },
  {
    id: "titan-raids",
    name: "Titán de la grieta",
    floor: 75,
    power: 90,
  },
  {
    id: "rey-catedral",
    name: "Rey de la catedral",
    floor: 100,
    power: 140,
  },
];

export function getBossForFloor(floor) {
  return BOSSES.find((boss) => boss.floor === floor);
}
