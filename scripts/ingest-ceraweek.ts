import { fetchCeraWeekConference } from "../lib/adapters/ceraweek";
import { getRepository } from "../lib/conference-repository";

async function main() {
  const graph = await fetchCeraWeekConference();
  const repository = getRepository();
  try {
    await repository.initialize();
    await repository.replaceConference(graph);
    console.log(
      JSON.stringify({ conferenceId: graph.conference.id, coverage: graph.coverage }, null, 2),
    );
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
