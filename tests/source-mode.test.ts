import { describe, expect, it } from "vitest";

import { formatSourceMode } from "@/lib/source-mode";

describe("formatSourceMode", () => {
  it("keeps Firecrawl provenance visible", () => {
    expect(formatSourceMode("firecrawl")).toBe("LIVE · FIRECRAWL");
    expect(formatSourceMode("live")).toBe("LIVE SOURCE");
    expect(formatSourceMode("demo")).toBe("DEMO DATA");
  });
});
