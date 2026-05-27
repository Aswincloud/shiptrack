import { Carrier } from "./types";
import { bluedart } from "./bluedart";

export const carriers: Record<string, Carrier> = {
  [bluedart.id]: bluedart,
};

export function getCarrier(id: string): Carrier | undefined {
  return carriers[id.toLowerCase()];
}

export function listCarriers(): { id: string; name: string }[] {
  return Object.values(carriers).map((c) => ({ id: c.id, name: c.name }));
}
