import type { SourceMode } from "@/lib/domain";

export function formatSourceMode(sourceMode: SourceMode): string {
  if (sourceMode === "demo") return "DEMO DATA";
  if (sourceMode === "firecrawl") return "LIVE · FIRECRAWL";
  return "LIVE SOURCE";
}
