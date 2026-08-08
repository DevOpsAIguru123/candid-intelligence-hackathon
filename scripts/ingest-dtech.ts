import { fetchDtechConference } from "../lib/adapters/dtech";
import { getRepository, type ConferenceRepository } from "../lib/conference-repository";

async function main(): Promise<void> {
  let repo: ConferenceRepository | undefined;
  try {
    repo = getRepository();
    await repo.initialize();

    const graph = await fetchDtechConference();
    const conferenceId = graph.conference.id;
    const priorConferences = await repo.listConferences();
    const existingConference = priorConferences.find(
      (conference) => conference.id === conferenceId,
    );

    if (
      existingConference &&
      existingConference.sourceUrl !== graph.conference.sourceUrl
    ) {
      throw new Error(
        `Conference "${conferenceId}" already exists with a different source URL`,
      );
    }

    const preservedConferenceIds = priorConferences
      .map((conference) => conference.id)
      .filter((id) => id !== conferenceId)
      .sort((a, b) => a.localeCompare(b));

    await repo.replaceConference(graph);

    const persistedConference = await repo.getConference(conferenceId);
    if (!persistedConference) {
      throw new Error(`Conference "${conferenceId}" was not persisted`);
    }
    if (persistedConference.sourceUrl !== graph.conference.sourceUrl) {
      throw new Error(
        `Conference "${conferenceId}" was persisted with a different source URL`,
      );
    }

    const [persistedSpeakers, persistedResearchTasks, persistedConferences] =
      await Promise.all([
        repo.listSpeakers(conferenceId),
        repo.listResearchTasks({ conferenceId }),
        repo.listConferences(),
      ]);

    if (persistedSpeakers.length !== graph.speakers.length) {
      throw new Error(
        `Conference "${conferenceId}" persisted ${persistedSpeakers.length} speakers; expected ${graph.speakers.length}`,
      );
    }
    if (persistedResearchTasks.length !== graph.researchTasks.length) {
      throw new Error(
        `Conference "${conferenceId}" persisted ${persistedResearchTasks.length} research tasks; expected ${graph.researchTasks.length}`,
      );
    }

    const persistedConferenceIds = new Set(
      persistedConferences.map((conference) => conference.id),
    );
    const missingConferenceIds = preservedConferenceIds.filter(
      (id) => !persistedConferenceIds.has(id),
    );
    if (missingConferenceIds.length > 0) {
      throw new Error(
        `Conference replacement did not preserve prior conference IDs: ${missingConferenceIds.join(", ")}`,
      );
    }

    const summary = {
      conferenceId,
      sessions: graph.sessions.length,
      structuredSpeakers: graph.coverage.structuredAgendaSpeakers,
      totalSpeakers: graph.coverage.totalSpeakers,
      researchTasks: graph.researchTasks.length,
      preservedConferenceIds,
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const sanitized = msg.replace(/postgresql:\/\/[^@]+@/gi, "postgresql://***:***@");
    console.error(
      JSON.stringify({
        error: "Ingestion failed",
        details: sanitized,
      }),
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
