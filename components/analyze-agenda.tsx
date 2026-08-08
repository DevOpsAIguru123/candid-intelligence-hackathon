"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Reads a watched event's public agenda on demand. Same ingestion path as the
 * overview form — this one just already knows the URL.
 */
export function AnalyzeAgenda({ agendaUrl }: { agendaUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: agendaUrl }),
      });
      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        conference?: { id: string };
      };
      if (!response.ok || !result.success || !result.conference) {
        throw new Error(result.message ?? "We could not read this agenda.");
      }
      router.push(`/conferences/${result.conference.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not read this agenda.");
      setBusy(false);
    }
  }

  return (
    <div className="analyze-agenda">
      <button className="primary-button" disabled={busy} onClick={() => void analyze()} type="button">
        {busy ? "Reading the agenda…" : "Read the speaker list now"}
      </button>
      {error ? <p className="error-callout">{error}</p> : null}
    </div>
  );
}
