"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { IngestionStatus } from "@/lib/domain";

const PIPELINE: Exclude<IngestionStatus, "idle" | "failed">[] = [
  "fetching",
  "extracting",
  "scoring",
  "sequencing",
  "complete",
];

const LABELS: Record<IngestionStatus, string> = {
  idle: "Ready for a public conference agenda",
  fetching: "Fetching public agenda",
  extracting: "Extracting speakers and sessions",
  scoring: "Scoring ICP fit",
  sequencing: "Building event-relative outreach",
  complete: "Analysis complete",
  failed: "Live analysis needs attention",
};

interface ApiResult {
  success: boolean;
  conference?: { id: string };
  message?: string;
}

export function IngestForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<IngestionStatus>("idle");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = !["idle", "failed"].includes(status);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  function beginProgress() {
    setError("");
    setStatus("fetching");
    let index = 0;
    timer.current = setInterval(() => {
      index = Math.min(index + 1, PIPELINE.length - 2);
      setStatus(PIPELINE[index]);
    }, 420);
  }

  async function run(payload: { url?: string; useDemo?: boolean }) {
    beginProgress();
    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.success || !result.conference) {
        throw new Error(result.message ?? "The conference could not be analyzed.");
      }

      if (timer.current) clearInterval(timer.current);
      setStatus("complete");
      router.push(`/conferences/${result.conference.id}`);
    } catch (caught) {
      if (timer.current) clearInterval(timer.current);
      setStatus("failed");
      setError(caught instanceof Error ? caught.message : "The conference could not be analyzed.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run({ url });
  }

  return (
    <section className="ingest-panel" aria-labelledby="ingest-title">
      <div className="ingest-copy">
        <p className="eyebrow">Live conference analysis</p>
        <h2 id="ingest-title">Conference URL in. Qualified motion out.</h2>
        <p>
          We inspect public agenda markup, preserve source provenance, and explain every point in
          the ranking.
        </p>
      </div>

      <form onSubmit={submit}>
        <label htmlFor="conference-url">Conference URL</label>
        <div className="input-row">
          <input
            id="conference-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://conference.com/agenda"
            required
          />
          <button className="primary-button" disabled={busy} type="submit">
            Analyze conference
          </button>
        </div>
      </form>

      <div className="ingest-footer">
        <div className={`pipeline-status pipeline-${status}`} role="status">
          <span className="live-dot" aria-hidden="true" />
          {LABELS[status]}
        </div>
        <span>or</span>
        <button className="text-button" disabled={busy} onClick={() => void run({ useDemo: true })} type="button">
          Load demo conference
        </button>
      </div>

      {busy ? (
        <ol className="pipeline-steps" aria-label="Ingestion progress">
          {PIPELINE.map((step) => (
            <li className={PIPELINE.indexOf(step) <= PIPELINE.indexOf(status as (typeof PIPELINE)[number]) ? "active" : ""} key={step}>
              {step}
            </li>
          ))}
        </ol>
      ) : null}
      {error ? <p className="error-callout">{error} The demo remains available and is always labeled.</p> : null}
    </section>
  );
}
