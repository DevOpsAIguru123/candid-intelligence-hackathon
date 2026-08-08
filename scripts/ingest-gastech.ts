import { fetchGastechConference } from "../lib/adapters/gastech";
import { getRepository } from "../lib/conference-repository";

async function main() {
  const graph = await fetchGastechConference();
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
