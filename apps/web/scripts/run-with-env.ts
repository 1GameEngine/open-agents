import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_BY_NODE_ENV = {
  development: ".env.dev",
  production: ".env.prod",
} as const;

const DEFAULT_ENV_FILE = ".env";

function getOverlayEnvFile() {
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "production"
    ? ENV_BY_NODE_ENV.production
    : ENV_BY_NODE_ENV.development;
}

function getEnvFilesToLoad() {
  const overlayEnvFile = getOverlayEnvFile();
  const filesToLoad: string[] = [];

  const defaultEnvPath = resolve(process.cwd(), DEFAULT_ENV_FILE);
  if (existsSync(defaultEnvPath)) {
    filesToLoad.push(DEFAULT_ENV_FILE);
  }

  const overlayEnvPath = resolve(process.cwd(), overlayEnvFile);
  if (existsSync(overlayEnvPath)) {
    filesToLoad.push(overlayEnvFile);
  }

  if (filesToLoad.length > 0) {
    return filesToLoad;
  }

  throw new Error(
    `No environment file found. Expected \`${DEFAULT_ENV_FILE}\` and/or \`${overlayEnvFile}\` in ${process.cwd()}.`,
  );
}

function parseEnvFileContent(content: string) {
  const envEntries: Record<string, string> = {};
  const lines = content.split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    let key = line.slice(0, separatorIndex).trim();
    if (key.startsWith("export ")) {
      key = key.slice(7).trim();
    }
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (key.length === 0) {
      continue;
    }

    if (
      rawValue.startsWith('"') &&
      rawValue.endsWith('"') &&
      rawValue.length >= 2
    ) {
      const unquoted = rawValue.slice(1, -1);
      envEntries[key] = unquoted
        .replace(/\\n/gu, "\n")
        .replace(/\\r/gu, "\r")
        .replace(/\\t/gu, "\t")
        .replace(/\\"/gu, '"');
      continue;
    }

    if (
      rawValue.startsWith("'") &&
      rawValue.endsWith("'") &&
      rawValue.length >= 2
    ) {
      envEntries[key] = rawValue.slice(1, -1);
      continue;
    }

    const hashIndex = rawValue.indexOf("#");
    envEntries[key] =
      hashIndex === -1 ? rawValue : rawValue.slice(0, hashIndex).trimEnd();
  }

  return envEntries;
}

function loadEnvFromFile(envFile: string) {
  const envPath = resolve(process.cwd(), envFile);
  const content = readFileSync(envPath, "utf8");
  return parseEnvFileContent(content);
}

function loadMergedEnvFromFiles(envFiles: string[]) {
  const mergedEnv: Record<string, string> = {};
  for (const envFile of envFiles) {
    Object.assign(mergedEnv, loadEnvFromFile(envFile));
  }
  return mergedEnv;
}

async function run() {
  const commandArgs = process.argv.slice(2);
  if (commandArgs.length === 0) {
    throw new Error(
      "Missing command. Example: `bun run scripts/run-with-env.ts next dev`",
    );
  }

  const envFiles = getEnvFilesToLoad();
  const loadedEnv = loadMergedEnvFromFiles(envFiles);
  process.stdout.write(`[run-with-env] loaded ${envFiles.join(" -> ")}\n`);

  const [command, ...args] = commandArgs;
  const activeEnvFile = envFiles[envFiles.length - 1];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...loadedEnv,
      OPEN_HARNESS_ENV_FILE: activeEnvFile,
      OPEN_HARNESS_ENV_FILES: envFiles.join(","),
    },
    stdio: "inherit",
  });

  await new Promise<void>((_resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Command terminated with signal: ${signal}`));
        return;
      }
      process.exit(code ?? 1);
    });
  });
}

void run();
