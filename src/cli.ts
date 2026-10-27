#!/usr/bin/env bun
import { boolFlag, parseArgs } from "./lib/args.ts";
import { runServe } from "./commands/serve.ts";
import { runSync } from "./commands/sync.ts";
import { COMMANDS, VERSION, commandHelp, globalHelp } from "./commands/help.ts";

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
});

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  let argv = raw;
  if (raw.length === 0) {
    argv = ["help"];
  } else if (raw[0]?.startsWith("-")) {
    argv = ["help", ...raw];
  }

  const { command, flags, positional } = parseArgs(argv);

  if (boolFlag(flags, "version")) {
    console.log(`yunxiao-insight ${VERSION}`);
    return;
  }

  if (command === "help") {
    console.log(commandHelp(positional[0] ?? "help"));
    return;
  }

  if (boolFlag(flags, "help")) {
    console.log(commandHelp(command));
    return;
  }

  if (!COMMANDS.includes(command)) {
    console.error(`[yunxiao-insight] 未知命令「${command}」\n`);
    console.log(globalHelp());
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case "serve":
      await runServe(flags);
      break;
    case "sync":
      await runSync(flags);
      break;
    default:
      console.log(globalHelp());
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (process.env.YUNXIAO_INSIGHT_DEBUG === "1" && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
