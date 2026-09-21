// "out_for_delivery" -> "Out For Delivery". Shared by the home page, the public
// track page and the share-preview metadata so a status reads the same
// everywhere.
export function humanStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
