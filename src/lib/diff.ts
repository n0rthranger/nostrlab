import type { DiffFile, DiffHunk, DiffLine } from "../types/nostr";

export function parseDiff(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = patch.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Find diff header
    if (!lines[i].startsWith("diff ")) {
      i++;
      continue;
    }

    let oldName = "";
    let newName = "";
    const hunks: DiffHunk[] = [];

    // Parse file names from diff header
    const diffMatch = lines[i].match(/diff --git a\/(.+) b\/(.+)/);
    if (diffMatch) {
      oldName = diffMatch[1];
      newName = diffMatch[2];
    }
    i++;

    // Skip index, ---/+++ lines
    while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("diff ")) {
      if (lines[i].startsWith("--- a/")) oldName = lines[i].slice(6);
      else if (lines[i].startsWith("--- /dev/null")) oldName = "/dev/null";
      if (lines[i].startsWith("+++ b/")) newName = lines[i].slice(6);
      else if (lines[i].startsWith("+++ /dev/null")) newName = "/dev/null";
      i++;
    }

    // Parse hunks
    while (i < lines.length && !lines[i].startsWith("diff ")) {
      if (lines[i].startsWith("@@")) {
        const hunkMatch = lines[i].match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?/);
        if (hunkMatch) {
          const oldStart = parseInt(hunkMatch[1], 10);
          const oldCount = parseInt(hunkMatch[2] ?? "1", 10);
          const newStart = parseInt(hunkMatch[3], 10);
          const newCount = parseInt(hunkMatch[4] ?? "1", 10);
          const hunkLines: DiffLine[] = [];

          hunkLines.push({ type: "header", content: lines[i] });
          i++;

          let oldLine = oldStart;
          let newLine = newStart;

          while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("diff ")) {
            const line = lines[i];
            if (line.startsWith("+")) {
              hunkLines.push({ type: "add", content: line.slice(1), newLineNo: newLine });
              newLine++;
            } else if (line.startsWith("-")) {
              hunkLines.push({ type: "remove", content: line.slice(1), oldLineNo: oldLine });
              oldLine++;
            } else if (line.startsWith("\\")) {
              // "\ No newline at end of file" — skip
              i++;
              continue;
            } else {
              // Context line (starts with space or is empty)
              hunkLines.push({
                type: "context",
                content: line.startsWith(" ") ? line.slice(1) : line,
                oldLineNo: oldLine,
                newLineNo: newLine,
              });
              oldLine++;
              newLine++;
            }
            i++;
          }

          hunks.push({ header: hunkMatch[0], oldStart, oldCount, newStart, newCount, lines: hunkLines });
        } else {
          i++;
        }
      } else {
        i++;
      }
    }

    files.push({ oldName, newName, hunks });
  }

  return files;
}

export function lineKey(file: string, lineNo: number, side: "old" | "new"): string {
  return `${file}:${side}:${lineNo}`;
}
