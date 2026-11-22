import { getZoneForFloor, isCityFloor, isSafeFloor } from "../content/floors.js";
import { getBossForFloor } from "../content/bosses.js";
import { createRng, pick } from "./random.js";
import { generateEncounter } from "./encounterGenerator.js";

export const FLOOR_EVENTS = [
  { id: "mercader", text: "Un mercader errante ofrece sus mercancías." },
  { id: "patrulla", text: "Una patrulla enemiga recorre el camino." },
  { id: "altar", text: "Encuentras un altar olvidado con runas." },
  { id: "magia", text: "El aire se vuelve pesado y la magia vibra." },
];

export function generateFloor({ floor, seed }) {
  const zone = getZoneForFloor(floor);
  const rng = createRng(`${seed}-${floor}`);
  const safe = isSafeFloor(floor);
  const city = isCityFloor(floor);
  const boss = getBossForFloor(floor);
  const event = pick(rng, FLOOR_EVENTS);
  const encounters =
    safe || city
      ? []
      : Array.from({ length: 3 + Math.floor(rng() * 3) }, () =>
          generateEncounter({ rng, difficulty: zone?.difficulty || "baja" })
        );

  return {
    floor,
    zone,
    safe,
    city,
    boss,
    event: event.text,
    eventId: event.id,
    encounters,
  };
}
