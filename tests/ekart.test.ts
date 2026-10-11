import { describe, it, expect, afterEach, vi } from "vitest";
import { ekart } from "@/carriers/ekart";
import { fixture, stubFetch } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

// Ekart makes two calls: a page GET (CSRF token + session cookies) then the
// JSON tracking POST. The page fixture must carry both or the carrier bails
// with "did not issue a tracking session".
const pageResponse = {
  body: fixture("ekart", "page.html"),
  setCookie: ["session=abc; Path=/", "session.sig=def; Path=/"],
};

describe("ekart parser", () => {
  it("parses a delivered shipment, keeping array order and title-casing cities", async () => {
    stubFetch([pageResponse, { body: fixture("ekart", "delivered.json") }]);
    const r = await ekart.track("FMPP4307095480");

    expect(r.status).toBe("delivered");
    expect(r.origin).toBe("Bangalore");
    expect(r.destination).toBe("Pondicherry");
    expect(r.events).toHaveLength(5);
    expect(r.events[0].description).toBe("Shipment Created");
    expect(r.events[r.events.length - 1].description).toBe("Delivered");
    // epoch ms -> ISO
    expect(r.events[0].timestamp).toMatch(/^20\d\d-/);
  });

  it("maps Out For Delivery before Delivered (both contain 'deliver')", async () => {
    stubFetch([pageResponse, { body: fixture("ekart", "delivered.json") }]);
    const r = await ekart.track("FMPP4307095480");
    const ofd = r.events.find((e) => e.description === "Out For Delivery");
    expect(ofd?.status).toBe("out_for_delivery");
  });

  it("treats an empty {} response as not_found", async () => {
    stubFetch([pageResponse, { body: fixture("ekart", "notfound.json") }]);
    await expect(ekart.track("FMPP0000000000")).rejects.toMatchObject({ code: "not_found" });
  });

  it("surfaces a CSRF rejection as upstream_error", async () => {
    stubFetch([pageResponse, { body: fixture("ekart", "csrf_error.json") }]);
    await expect(ekart.track("FMPP4307095480")).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("bails as upstream_error when the page has no CSRF token", async () => {
    stubFetch([{ body: "<html>no token here</html>" }, { body: "{}" }]);
    await expect(ekart.track("FMPP4307095480")).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("rejects a malformed tracking ID before fetching", async () => {
    const spy = stubFetch([pageResponse]);
    await expect(ekart.track("123")).rejects.toMatchObject({ code: "invalid_input" });
    expect(spy).not.toHaveBeenCalled();
  });
});
