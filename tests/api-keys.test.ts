import { describe, it, expect } from "vitest";
import {
  hashApiKey,
  looksLikeApiKey,
  API_KEY_PREFIX,
} from "@/lib/api-keys";

describe("api key format", () => {
  it("accepts a well-formed key and rejects everything else", () => {
    const good = `${API_KEY_PREFIX}${"a".repeat(40)}`;
    expect(looksLikeApiKey(good)).toBe(true);
    for (const bad of [
      "",
      "st_",
      "st_short",
      `${API_KEY_PREFIX}${"a".repeat(39)}`, // too short
      `${API_KEY_PREFIX}${"a".repeat(41)}`, // too long
      `xx_${"a".repeat(40)}`, // wrong prefix
      `${API_KEY_PREFIX}${"a".repeat(39)}-`, // non-base62
      "Bearer st_" + "a".repeat(40),
    ]) {
      expect(looksLikeApiKey(bad), bad).toBe(false);
    }
  });

  it("hashes to a stable 64-char hex digest that differs per key", async () => {
    const a = `${API_KEY_PREFIX}${"a".repeat(40)}`;
    const b = `${API_KEY_PREFIX}${"b".repeat(40)}`;
    const ha = await hashApiKey(a);
    expect(ha).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashApiKey(a)).toBe(ha); // stable
    expect(await hashApiKey(b)).not.toBe(ha); // distinct
  });
});
