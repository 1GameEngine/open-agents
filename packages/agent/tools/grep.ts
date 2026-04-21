/**
 * grep tool — pure Node.js implementation.
 *
 * Replaces the original shell-based grep that called sandbox.exec().
 * Works with both Vercel cloud sandbox and local-fs sandbox (self-hosted mode).
 */
import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import type { Dirent } from "fs";
import { getSandbox, toDisplayPath } from "./utils";

/** Convert a simple glob pattern (e.g. "*.ts") to a RegExp */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/** Recursively collect all files under a directory, skipping hidden dirs and node_modules */
async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
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
      const sub = await collectFiles(fullPath);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

const grepInputSchema = z.object({
  pattern: z.string().describe("Regex pattern to search for"),
  path: z
    .string()
    .describe("Workspace-relative file or directory to search in (e.g., src)"),
  glob: z
    .string()
    .optional()
    .describe("Glob pattern to filter files (e.g., '*.ts')"),
  caseSensitive: z
    .boolean()
    .optional()
    .describe("Case-sensitive search. Default: true"),
});

export const grepTool = () =>
  tool({
    description: `Search for patterns in files using JavaScript regular expressions.

WHEN TO USE:
- Finding where a function, variable, or string literal is used
- Locating configuration keys, routes, or error messages across files
- Narrowing down which files to read or edit

WHEN NOT TO USE:
- Simple filename-only searches (use globTool instead)
- Complex, multi-round codebase exploration (use taskTool with detailed instructions)

USAGE:
- Uses JavaScript regex syntax (e.g., "log.*Error", "function\\s+[a-zA-Z_]+")
- Search a specific file OR an entire directory via the path parameter
- Use workspace-relative paths for path (e.g., "src")
- Optionally filter files with glob (e.g., "*.ts", "*.test.js")
- Matches are SINGLE-LINE: patterns do not span across newline characters
- Results are limited to 100 matches total, with up to 10 matches per file; each match line is truncated to 200 characters

IMPORTANT:
- ALWAYS use this tool for code/content searches
- Use caseSensitive: false for case-insensitive searches
- Hidden files and node_modules are skipped when searching directories

EXAMPLES:
- Find all TODO comments in TypeScript files: pattern: "TODO", path: "src", glob: "*.ts"
- Find all references to a function (case-insensitive): pattern: "handleRequest", path: "src", caseSensitive: false`,
    inputSchema: grepInputSchema,
    execute: async (
      { pattern, path: searchPath, glob, caseSensitive = true },
      { experimental_context },
    ) => {
      const sandbox = await getSandbox(experimental_context, "grep");
      const workingDirectory = sandbox.workingDirectory;

      try {
        const absolutePath = path.isAbsolute(searchPath)
          ? searchPath
          : path.resolve(workingDirectory, searchPath);

        // Compile the search regex
        let regex: RegExp;
        try {
          regex = new RegExp(pattern, caseSensitive ? "" : "i");
        } catch (e) {
          return {
            success: false,
            error: `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`,
          };
        }

        // Determine whether we're searching a file or a directory
        let filesToSearch: string[];
        let stat: Awaited<ReturnType<typeof sandbox.stat>>;
        try {
          stat = await sandbox.stat(absolutePath);
        } catch {
          return {
            success: false,
            error: `Path not found: "${searchPath}"`,
          };
        }

        if (stat.isFile()) {
          filesToSearch = [absolutePath];
        } else if (stat.isDirectory()) {
          filesToSearch = await collectFiles(absolutePath);
        } else {
          return {
            success: false,
            error: "Path is neither a file nor a directory",
          };
        }

        // Apply glob filter if provided
        if (glob) {
          const globRe = globToRegex(glob);
          filesToSearch = filesToSearch.filter((f) =>
            globRe.test(path.basename(f)),
          );
        }

        const maxTotal = 100;
        const maxPerFile = 10;
        const matches: GrepMatch[] = [];
        const filesSet = new Set<string>();
        const fileMatchCounts = new Map<string, number>();

        for (const filePath of filesToSearch) {
          if (matches.length >= maxTotal) break;

          let content: string;
          try {
            content = await sandbox.readFile(filePath, "utf-8");
          } catch {
            continue; // skip unreadable files (binary, permission denied, etc.)
          }

          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxTotal) break;

            const line = lines[i]!;
            if (!regex.test(line)) continue;

            const displayFile = toDisplayPath(filePath, workingDirectory);
            filesSet.add(displayFile);

            const currentCount = fileMatchCounts.get(displayFile) ?? 0;
            if (currentCount >= maxPerFile) continue;
            fileMatchCounts.set(displayFile, currentCount + 1);

            matches.push({
              file: displayFile,
              line: i + 1,
              content: line.slice(0, 200),
            });
          }
        }

        const response: Record<string, unknown> = {
          success: true,
          pattern,
          matchCount: matches.length,
          filesWithMatches: filesSet.size,
          matches,
        };

        if (matches.length === 0) {
          response._debug = {
            filesSearched: filesToSearch.length,
            pattern,
          };
        }

        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Grep failed: ${message}`,
        };
      }
    },
  });
