import { Carrier } from "./types";
import { bluedart } from "./bluedart";
import { shiprocket } from "./shiprocket";
import { delhivery } from "./delhivery";
import { stcourier } from "./stcourier";

export const carriers: Record<string, Carrier> = {
  [bluedart.id]: bluedart,
  [shiprocket.id]: shiprocket,
  [delhivery.id]: delhivery,
  [stcourier.id]: stcourier,
};

export function getCarrier(id: string): Carrier | undefined {
  return carriers[id.toLowerCase()];
}

export function listCarriers(): { id: string; name: string; privateOnly?: boolean }[] {
  return Object.values(carriers).map((c) => ({ id: c.id, name: c.name, privateOnly: c.privateOnly }));
}
