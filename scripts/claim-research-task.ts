import { getRepository, type ConferenceRepository } from "../lib/conference-repository";

function parseCliArgs(args: string[]) {
  let agent: string | undefined;
  let conference: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--agent" || arg === "-a") {
      if (agent !== undefined) {
        throw new Error("Duplicate --agent flag");
      }
      i++;
      if (i >= args.length || args[i].startsWith("--")) {
        throw new Error("Missing value for --agent");
      }
      agent = args[i].trim();
      if (!agent) {
        throw new Error("--agent value cannot be empty");
      }
    } else if (arg === "--conference" || arg === "-c") {
      if (conference !== undefined) {
        throw new Error("Duplicate --conference flag");
      }
      i++;
      if (i >= args.length || args[i].startsWith("--")) {
        throw new Error("Missing value for --conference");
      }
      conference = args[i].trim();
      if (!conference) {
        throw new Error("--conference value cannot be empty");
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!agent) {
    throw new Error("Missing required argument: --agent <id>");
  }

  return { agent, conference };
}

async function main(): Promise<void> {
  let repo: ConferenceRepository | undefined;
  try {
    const { agent, conference } = parseCliArgs(process.argv.slice(2));

    repo = getRepository();
    await repo.initialize();

    const task = await repo.claimResearchTask(agent, conference);

    if (!task) {
      console.log(
        JSON.stringify(
          {
            claimed: false,
            message: "No pending research tasks available",
          },
          null,
          2
        )
      );
      return;
    }

    console.log(
      JSON.stringify(
        {
          claimed: true,
          task: {
            id: task.id,
            conferenceId: task.conferenceId,
            sessionId: task.sessionId,
            targetUrl: task.targetUrl,
            title: task.title,
            priority: task.priority,
            instructions: task.instructions,
            claimedBy: task.claimedBy ?? agent,
            claimedAt: task.claimedAt ?? new Date().toISOString(),
          },
        },
        null,
        2
      )
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const sanitized = msg.replace(/postgresql:\/\/[^@]+@/gi, "postgresql://***:***@");
    console.error(
      JSON.stringify({
        error: "Task claim failed",
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
