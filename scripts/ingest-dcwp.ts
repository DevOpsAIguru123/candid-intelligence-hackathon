import { fetchDcwpConference } from "../lib/adapters/dcwp";
import { getRepository, type ConferenceRepository } from "../lib/conference-repository";

async function main(): Promise<void> {
  let repo: ConferenceRepository | undefined;
  try {
    repo = getRepository();
    await repo.initialize();

    const graph = await fetchDcwpConference();
    await repo.replaceConference(graph);

    const conferenceId = graph.conference.id;
    const coverage = graph.coverage ?? {};
    const sessions = graph.sessions ?? [];
    const speakers = graph.speakers ?? [];
    const researchTasks = graph.researchTasks ?? [];

    const summary = {
      conferenceId,
      sessions: coverage.extractedSessions ?? sessions.length,
      indexed: coverage.extractedIndexedSpeakers ?? 0,
      descriptionOnly: coverage.descriptionOnlySpeakers ?? 0,
      total: coverage.totalSpeakers ?? speakers.length,
      researchTasks: researchTasks.length,
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const sanitized = msg.replace(/postgresql:\/\/[^@]+@/gi, "postgresql://***:***@");
    console.error(
      JSON.stringify({
        error: "Ingestion failed",
        details: sanitized,
      })
    );
    process.exitCode = 1;
  } finally {
    if (repo) {
      try {
        await repo.close();
      } catch {
        // Suppress cleanup error on exit
      }
    }
  }
}

void main();
