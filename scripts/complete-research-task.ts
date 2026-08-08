import { readFileSync } from "node:fs";
import { getRepository, type ConferenceRepository } from "../lib/conference-repository";
import { researchTaskOutputSchema } from "../lib/conference-intelligence";

function parseCliArgs(args: string[]) {
  let agent: string | undefined;
  let task: string | undefined;
  let output: string | undefined;

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
    } else if (arg === "--task" || arg === "-t") {
      if (task !== undefined) {
        throw new Error("Duplicate --task flag");
      }
      i++;
      if (i >= args.length || args[i].startsWith("--")) {
        throw new Error("Missing value for --task");
      }
      task = args[i].trim();
      if (!task) {
        throw new Error("--task value cannot be empty");
      }
    } else if (arg === "--output" || arg === "-o") {
      if (output !== undefined) {
        throw new Error("Duplicate --output flag");
      }
      i++;
      if (i >= args.length || args[i].startsWith("--")) {
        throw new Error("Missing value for --output");
      }
      output = args[i].trim();
      if (!output) {
        throw new Error("--output value cannot be empty");
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!agent) {
    throw new Error("Missing required argument: --agent <id>");
  }
  if (!task) {
    throw new Error("Missing required argument: --task <id>");
  }
  if (!output) {
    throw new Error("Missing required argument: --output <json-file>");
  }

  return { agent, task, output };
}

async function main(): Promise<void> {
  let repo: ConferenceRepository | undefined;
  try {
    const { agent, task, output: outputFilePath } = parseCliArgs(process.argv.slice(2));

    let fileContent: string;
    try {
      fileContent = readFileSync(outputFilePath, "utf8");
    } catch (readErr: unknown) {
      const msg = readErr instanceof Error ? readErr.message : String(readErr);
      throw new Error(`Failed to read output file: ${msg}`);
    }

    let parsedOutput: unknown;
    try {
      parsedOutput = JSON.parse(fileContent);
    } catch (jsonErr: unknown) {
      const msg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
      throw new Error(`Invalid JSON content in output file: ${msg}`);
    }

    const validatedOutput = researchTaskOutputSchema.safeParse(parsedOutput);
    if (!validatedOutput.success) {
      const issue = validatedOutput.error.issues[0];
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "root";
      throw new Error(`Output JSON does not match research contract at ${path}: ${issue.message}`);
    }

    repo = getRepository();
    await repo.initialize();

    const completedTask = await repo.completeResearchTask(
      task,
      agent,
      validatedOutput.data,
    );

    console.log(
      JSON.stringify(
        {
          completed: true,
          task: {
            id: completedTask.id,
            status: completedTask.status,
            completedAt: completedTask.completedAt ?? new Date().toISOString(),
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
        error: "Task completion failed",
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
