import { describe, expect, it, vi } from "vitest";
import { identifySpeakerSignal } from "@/lib/openai-agent";
import type { Conference, Speaker } from "@/lib/domain";

const mockConference: Conference = {
  id: "dcw-2026",
  name: "Data Center World 2026",
  sourceUrl: "https://schedule.datacenterworld.com/speakers",
  location: "Walter E. Washington Convention Center, Washington DC",
  startsAt: "2026-04-20T09:00:00Z",
  endsAt: "2026-04-23T17:00:00Z",
  sourceMode: "firecrawl",
  ingestionStatus: "complete",
  lastIngestedAt: "2026-08-08T12:00:00Z",
};

const mockSpeaker: Speaker = {
  id: "dcw-2026:gene-alessandrini",
  conferenceId: "dcw-2026",
  name: "Gene Alessandrini",
  title: "Senior Vice President of Energy & Location Strategy",
  company: "CyrusOne",
  email: "",
  phone: "",
  linkedinUrl: "",
  profileUrl: "",
  sessionTitle: "Energy Allies: The Role of Data Centers in Building Grid Infrastructure",
  score: 80,
  scoreReasons: [
    {
      group: "seniority",
      points: 25,
      reason: "Senior decision-maker",
      evidence: "Senior Vice President of Energy & Location Strategy",
    },
    {
      group: "company",
      points: 25,
      reason: "Works for an energy owner, developer, or operator",
      evidence: "CyrusOne",
    },
  ],
  dedupeKey: "gene-alessandrini-cyrusone",
};

describe("identifySpeakerSignal", () => {
  it("generates deterministic fallback signal when OPENAI_API_KEY is not set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await identifySpeakerSignal(mockSpeaker, mockConference);

    expect(result.speakerId).toBe(mockSpeaker.id);
    expect(result.name).toBe("Gene Alessandrini");
    expect(result.company).toBe("CyrusOne");
    expect(result.agentModel).toBe("deterministic-fallback");
    expect(result.whyNowSignal).toContain("Gene Alessandrini");
    expect(result.personalizedOutreach.subject).toContain("CyrusOne");
  });

  it("calls OpenAI chat completion when API key is provided", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  whyNowSignal: "Gene Alessandrini controls CyrusOne's power location strategy ahead of DCW 2026.",
                  subject: "DCW 2026: Power origination strategy for CyrusOne",
                  body: "Hi Gene, I saw your upcoming session on Energy Allies...",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    vi.stubGlobal("fetch", fetchImpl);

    const result = await identifySpeakerSignal(mockSpeaker, mockConference, {
      apiKey: "test-openai-key",
      model: "gpt-4o-mini",
    });

    expect(result.agentModel).toBe("gpt-4o-mini");
    expect(result.whyNowSignal).toContain("CyrusOne's power location strategy");
    expect(result.personalizedOutreach.subject).toContain("DCW 2026");
  });
});
