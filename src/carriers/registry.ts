import { Carrier } from "./types";
import { amazon } from "./amazon";
import { bluedart } from "./bluedart";
import { shiprocket } from "./shiprocket";
import { delhivery } from "./delhivery";
import { ekart } from "./ekart";
import { stcourier } from "./stcourier";
import { tpc } from "./tpc";

export const carriers: Record<string, Carrier> = {
  [bluedart.id]: bluedart,
  [shiprocket.id]: shiprocket,
  [delhivery.id]: delhivery,
  [stcourier.id]: stcourier,
  [tpc.id]: tpc,
  [amazon.id]: amazon,
  [ekart.id]: ekart,
};

export function getCarrier(id: string): Carrier | undefined {
  // Own keys only: a request naming "constructor" or "__proto__" must not
  // resolve to an inherited Object property.
  const key = id.toLowerCase();
  return Object.prototype.hasOwnProperty.call(carriers, key) ? carriers[key] : undefined;
}

export function listCarriers(): { id: string; name: string; privateOnly?: boolean }[] {
  return Object.values(carriers).map((c) => ({ id: c.id, name: c.name, privateOnly: c.privateOnly }));
}
