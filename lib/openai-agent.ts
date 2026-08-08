import OpenAI from "openai";
import type { Conference, Speaker } from "@/lib/domain";

export interface AgentSignalResult {
  speakerId: string;
  name: string;
  company: string;
  icpScore: number;
  whyNowSignal: string;
  personalizedOutreach: {
    subject: string;
    body: string;
  };
  agentModel: string;
}

export async function identifySpeakerSignal(
  speaker: Speaker,
  conference: Conference,
  options?: { apiKey?: string; model?: string }
): Promise<AgentSignalResult> {
  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY?.trim();
  const model = options?.model || "gpt-4o-mini";

  if (!apiKey) {
    return {
      speakerId: speaker.id,
      name: speaker.name,
      company: speaker.company,
      icpScore: speaker.score,
      whyNowSignal: `${speaker.name} (${speaker.title} at ${speaker.company}) is presenting on "${speaker.sessionTitle}". High-priority fit for power origination and interconnection planning.`,
      personalizedOutreach: {
        subject: `Connecting before ${conference.name}: Power origination & early-stage site selection for ${speaker.company}`,
        body: `Hi ${speaker.name.split(" ")[0]},\n\nI saw you are speaking at ${conference.name} regarding "${speaker.sessionTitle}". Given your role as ${speaker.title} at ${speaker.company}, your session directly targets the most critical bottleneck facing scale today: speed-to-power.\n\nAt Candid Intelligence, we partner directly with energy and data center leaders to solve early-stage energy origination before grid queue delays stall development. Our platform accelerates interconnection timelines and pairs large loads with firm power developers.\n\nWould you be open to a brief 10-minute meeting at ${conference.name} to explore how we can support ${speaker.company}'s upcoming energy pipeline?\n\nBest regards,\nCandid Intelligence Origination Team`,
      },
      agentModel: "deterministic-fallback",
    };
  }

  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const systemPrompt = `
You are an executive AI origination analyst for Candid Intelligence, an energy-infrastructure origination platform for data centers.
Candid Intelligence Value Proposition:
- Focuses on early-stage energy and power infrastructure projects for large-load data center developments.
- Provides speed-to-power, site selection intelligence, grid capacity forecasting, behind-the-meter generation, and interconnection origination.

Your task:
Analyze a conference speaker and return a JSON object with:
1. "whyNowSignal": A 1-2 sentence high-impact executive rationale explaining WHY NOW is the time to engage this speaker regarding data center power.
2. "subject": A compelling, non-spammy email subject line for pre-conference outreach.
3. "body": A concise 3-paragraph executive outreach message connecting their session topic to Candid's early-stage power origination capabilities.
`;

  const userPrompt = `
Speaker Details:
- Name: ${speaker.name}
- Title: ${speaker.title}
- Company: ${speaker.company}
- Session Title: "${speaker.sessionTitle}"
- Conference: ${conference.name}
- Location: ${conference.location}
- Start Date: ${conference.startsAt}
- ICP Score: ${speaker.score}/100

Respond strictly in valid JSON format matching this schema:
{
  "whyNowSignal": "string",
  "subject": "string",
  "body": "string"
}
`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);

    return {
      speakerId: speaker.id,
      name: speaker.name,
      company: speaker.company,
      icpScore: speaker.score,
      whyNowSignal: parsed.whyNowSignal || `${speaker.name} is presenting on "${speaker.sessionTitle}".`,
      personalizedOutreach: {
        subject: parsed.subject || `Connecting before ${conference.name} for ${speaker.company}`,
        body: parsed.body || `Hi ${speaker.name}, regarding your session "${speaker.sessionTitle}"...`,
      },
      agentModel: model,
    };
  } catch (error) {
    console.warn("OpenAI Agent execution fallback due to API error:", error);
    return {
      speakerId: speaker.id,
      name: speaker.name,
      company: speaker.company,
      icpScore: speaker.score,
      whyNowSignal: `${speaker.name} (${speaker.title} at ${speaker.company}) is presenting on "${speaker.sessionTitle}".`,
      personalizedOutreach: {
        subject: `Connecting before ${conference.name}: Power origination for ${speaker.company}`,
        body: `Hi ${speaker.name.split(" ")[0]},\n\nI saw you are speaking at ${conference.name} regarding "${speaker.sessionTitle}"...`,
      },
      agentModel: "deterministic-fallback",
    };
  }
}
