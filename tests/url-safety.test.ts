import { describe, expect, it } from "vitest";

import { assertPublicHttpUrl, type LookupFn } from "@/lib/url-safety";

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];

describe("assertPublicHttpUrl", () => {
  it.each([
    "file:///etc/passwd",
    "http://127.0.0.1",
    "http://localhost",
    "http://169.254.169.254",
    "http://[::1]",
    "https://user:password@events.example",
  ])("rejects non-public target %s", async (url) => {
    await expect(assertPublicHttpUrl(url, publicLookup)).rejects.toThrow(/public HTTP/i);
  });

  it("rejects a hostname that resolves to a private address", async () => {
    const privateLookup: LookupFn = async () => [{ address: "10.0.0.4", family: 4 }];

    await expect(assertPublicHttpUrl("https://events.example", privateLookup)).rejects.toThrow(
      /public HTTP/i,
    );
  });

  it("accepts a public HTTPS URL", async () => {
    await expect(
      assertPublicHttpUrl("https://events.example/agenda", publicLookup),
    ).resolves.toMatchObject({ hostname: "events.example", pathname: "/agenda" });
  });
});
