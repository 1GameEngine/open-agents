/**
 * glob tool — pure Node.js implementation.
 *
 * Replaces the original shell-based glob that called sandbox.exec() with find.
 * Works with both Vercel cloud sandbox and local-fs sandbox (self-hosted mode).
 */

import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import type { Dirent } from "fs";
import { getSandbox, toDisplayPath } from "./utils";

interface FileInfo {
  path: string;
  size: number;
  modifiedAt: number;
}

const globInputSchema = z.object({
  pattern: z.string().describe("Glob pattern to match (e.g., '**/*.ts')"),
  path: z
    .string()
    .optional()
    .describe("Workspace-relative base directory to search from (e.g., src)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results. Default: 100"),
});

/** Convert a simple glob name pattern (e.g. "*.ts") to a RegExp for file name matching */
function namePatternToRegex(namePattern: string): RegExp {
  const escaped = namePattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/**
 * Recursively walk a directory, collecting files that match the name pattern.
 * Skips hidden entries and node_modules.
 *
 * @param dir       - Absolute directory to search
 * @param nameRe    - Regex to match against the file name (basename)
 * @param maxDepth  - Maximum recursion depth (undefined = unlimited)
 * @param depth     - Current recursion depth (internal)
 */
async function walkDir(
  dir: string,
  nameRe: RegExp,
  maxDepth: number | undefined,
  depth = 0,
): Promise<FileInfo[]> {
  const results: FileInfo[] = [];

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (maxDepth === undefined || depth < maxDepth - 1) {
        const sub = await walkDir(fullPath, nameRe, maxDepth, depth + 1);
        results.push(...sub);
      }
    } else if (entry.isFile()) {
      if (nameRe.test(entry.name)) {
        try {
          const stat = await fs.stat(fullPath);
          results.push({
            path: fullPath,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
          });
        } catch {
          // skip files we can't stat
        }
      }
    }
  }

  return results;
}

export const globTool = () =>
  tool({
    description: `Find files matching a glob pattern.

WHEN TO USE:
- Locating files by extension or naming pattern (e.g., all *.test.ts files)
- Discovering where components, migrations, or configs live
- Getting a quick list of recently modified files of a given type

WHEN NOT TO USE:
- Searching inside file contents (use grepTool instead)
- Reading file contents (use readFileTool instead)

USAGE:
- Supports patterns like "**/*.ts", "src/**/*.js", "*.json"
- Returns FILES (not directories) sorted by modification time (newest first)
- Skips hidden files (names starting with ".") and node_modules
- If path is omitted, the current working directory is used as the base
- Use workspace-relative paths when setting path
- Results are limited by the limit parameter (default: 100)

IMPORTANT:
- Patterns are matched primarily on the final path segment (file name), with basic "*" and "**" support
- Use this to narrow down candidate files before calling readFileTool or grepTool

EXAMPLES:
- All TypeScript files in the project: pattern: "**/*.ts"
- All Jest tests under src: pattern: "src/**/*.test.ts"
- Recent JSON config files: pattern: "*.json", path: "config", limit: 20`,
    inputSchema: globInputSchema,
    execute: async (
      { pattern, path: basePath, limit = 100 },
      { experimental_context },
    ) => {
      const sandbox = await getSandbox(experimental_context, "glob");
      const workingDirectory = sandbox.workingDirectory;

      try {
        let searchDir: string;
        if (basePath) {
          searchDir = path.isAbsolute(basePath)
            ? basePath
            : path.resolve(workingDirectory, basePath);
        } else {
          searchDir = workingDirectory;
        }

        // Parse the glob pattern to extract:
        //   - literal directory prefix (e.g. "src/components" from "src/components/**/*.tsx")
        //   - name pattern (last segment, e.g. "*.tsx")
        //   - whether the pattern is recursive ("**" present)
        const patternParts = pattern.split("/").filter(Boolean);
        const namePattern = patternParts[patternParts.length - 1] ?? "*";

        const literalPrefix: string[] = [];
        for (let i = 0; i < patternParts.length - 1; i++) {
          const part = patternParts[i]!;
          if (part.includes("*") || part.includes("?") || part.includes("[")) {
            break;
          }
          literalPrefix.push(part);
        }
        if (literalPrefix.length > 0) {
          searchDir = path.join(searchDir, ...literalPrefix);
        }

        const remainingDirSegments = patternParts.slice(
          literalPrefix.length,
          patternParts.length - 1,
        );
        const hasRecursiveWildcard =
          remainingDirSegments.some((s) => s === "**") || namePattern === "**";

        // maxDepth: undefined = unlimited (recursive), number = limited depth
        let maxDepth: number | undefined;
        if (!hasRecursiveWildcard) {
          maxDepth = remainingDirSegments.length + 1;
        }

        // Verify the search directory exists
        try {
          const stat = await fs.stat(searchDir);
          if (!stat.isDirectory()) {
            return {
              success: false,
              error: `"${searchDir}" is not a directory`,
            };
          }
        } catch {
          return {
            success: false,
            error: `Directory not found: "${basePath ?? "."}"`,
          };
        }

        const nameRe = namePatternToRegex(namePattern);
        let files = await walkDir(searchDir, nameRe, maxDepth);

        // Sort by modification time descending (newest first)
        files.sort((a, b) => b.modifiedAt - a.modifiedAt);

        // Apply limit
        files = files.slice(0, limit);

        const response: Record<string, unknown> = {
          success: true,
          pattern,
          baseDir: toDisplayPath(searchDir, workingDirectory),
          count: files.length,
          files: files.map((f) => ({
            path: toDisplayPath(f.path, workingDirectory),
            size: f.size,
            modifiedAt: new Date(f.modifiedAt).toISOString(),
          })),
        };

        if (files.length === 0) {
          response._debug = {
            searchDir: toDisplayPath(searchDir, workingDirectory),
            namePattern,
            maxDepth,
          };
        }

        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Glob failed: ${message}`,
        };
      }
    },
  });
