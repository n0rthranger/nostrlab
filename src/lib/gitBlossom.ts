/**
 * Bridge between isomorphic-git and Blossom storage.
 * Handles exporting git repos as packfiles and uploading to Blossom,
 * and cloning from Blossom packfile URLs.
 */
import git from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";
import { uploadBlob, downloadBlob } from "./blossom";
import type { Signer } from "./nostr";

let fs: LightningFS | null = null;

export function getFS(): LightningFS {
  if (!fs) fs = new LightningFS("gitnostr");
  return fs;
}

// ── Helper: collect all reachable OIDs ──

async function collectAllOids(fsInstance: LightningFS, dir: string): Promise<string[]> {
  const oids = new Set<string>();

  try {
    const commits = await git.log({ fs: fsInstance, dir, depth: 10000 });
    for (const commit of commits) {
      oids.add(commit.oid);

      // Walk tree recursively
      const walkTree = async (treeOid: string) => {
        if (oids.has(treeOid)) return;
        oids.add(treeOid);
        try {
          const { tree } = await git.readTree({ fs: fsInstance, dir, oid: treeOid });
          for (const entry of tree) {
            oids.add(entry.oid);
            if (entry.type === "tree") {
              await walkTree(entry.oid);
            }
          }
        } catch {
          // ignore unreadable objects
        }
      };

      await walkTree(commit.commit.tree);
    }
  } catch {
    // empty repo or no commits
  }

  return [...oids];
}

// ── Export & Push ──

/**
 * Export the entire git repo at `dir` as a packfile (Uint8Array).
 */
export async function exportPackfile(dir: string): Promise<Uint8Array> {
  const fsInstance = getFS();
  const oids = await collectAllOids(fsInstance, dir);

  if (oids.length === 0) {
    throw new Error("No git objects to export — is the repository empty?");
  }

  const { packfile } = await git.packObjects({
    fs: fsInstance,
    dir,
    oids,
  });

  return packfile;
}

/**
 * Export the repo as a packfile and upload it to Blossom.
 * Returns the Blossom URL of the uploaded packfile.
 */
export async function pushToBlossom(
  signer: Signer,
  dir: string,
  server?: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  onProgress?.("Packing git objects...");
  const packfile = await exportPackfile(dir);

  onProgress?.(`Uploading packfile (${(packfile.length / 1024).toFixed(1)} KB)...`);
  const result = await uploadBlob(signer, packfile, server);

  onProgress?.("Upload complete!");
  return result.url;
}

// ── Import & Clone ──

/**
 * Initialize a bare .git structure in LightningFS.
 */
async function initGitDir(fsInstance: LightningFS, dir: string): Promise<void> {
  const mkdirp = async (path: string) => {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current += "/" + part;
      try {
        await fsInstance.promises.mkdir(current);
      } catch {
        // exists
      }
    }
  };

  await mkdirp(`${dir}/.git/objects/pack`);
  await mkdirp(`${dir}/.git/refs/heads`);
  await mkdirp(`${dir}/.git/refs/tags`);
  await fsInstance.promises.writeFile(`${dir}/.git/HEAD`, "ref: refs/heads/main\n");
  await fsInstance.promises.writeFile(
    `${dir}/.git/config`,
    "[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n",
  );
}

/**
 * Clone a repo from a Blossom packfile URL into the browser's filesystem.
 */
export async function cloneFromBlossom(
  url: string,
  dir: string,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const fsInstance = getFS();

  onProgress?.("Downloading packfile...");
  const packData = await downloadBlob(url);

  onProgress?.("Initializing repository...");
  await initGitDir(fsInstance, dir);

  // Write the packfile
  const packPath = `.git/objects/pack/pack-blossom.pack`;
  await fsInstance.promises.writeFile(`${dir}/${packPath}`, packData);

  onProgress?.("Indexing packfile...");
  await git.indexPack({
    fs: fsInstance,
    dir,
    filepath: packPath,
  });

  // Find available branches by checking refs
  onProgress?.("Setting up branches...");

  // Try to resolve HEAD from the pack — look for common default branches
  const defaultBranches = ["main", "master", "develop"];
  let checkedOut = false;

  // List all commits to find the latest one
  try {
    // Read all refs from the pack index
    const branches = await git.listBranches({ fs: fsInstance, dir });
    if (branches.length > 0) {
      await git.checkout({ fs: fsInstance, dir, ref: branches[0] });
      checkedOut = true;
    }
  } catch {
    // no branches yet
  }

  if (!checkedOut) {
    // If no branches, try to find commits and create a branch from the latest
    try {
      const commits = await git.log({ fs: fsInstance, dir, depth: 1 });
      if (commits.length > 0) {
        // Create main branch pointing to this commit
        await fsInstance.promises.writeFile(
          `${dir}/.git/refs/heads/main`,
          commits[0].oid + "\n",
        );
        await git.checkout({ fs: fsInstance, dir, ref: "main" });
        checkedOut = true;
      }
    } catch {
      // Try alternative: walk packfile for commit objects
      for (const branch of defaultBranches) {
        try {
          await git.checkout({ fs: fsInstance, dir, ref: branch });
          checkedOut = true;
          break;
        } catch {
          continue;
        }
      }
    }
  }

  if (!checkedOut) {
    onProgress?.("Warning: could not checkout any branch");
  }

  onProgress?.("Clone complete!");
}

// ── Init local repo ──

/**
 * Initialize a new git repo in the browser filesystem with optional initial files.
 */
export async function initLocalRepo(
  dir: string,
  options: {
    name: string;
    description?: string;
    addReadme?: boolean;
    license?: string;
    gitignore?: string;
    authorName: string;
    authorEmail: string;
  },
): Promise<void> {
  const fsInstance = getFS();

  await git.init({ fs: fsInstance, dir, defaultBranch: "main" });

  const filesToAdd: string[] = [];

  // README
  if (options.addReadme) {
    const content = `# ${options.name}\n\n${options.description || "A new repository on NostrLab."}\n`;
    await fsInstance.promises.writeFile(`${dir}/README.md`, content);
    filesToAdd.push("README.md");
  }

  // .gitignore
  if (options.gitignore && options.gitignore !== "None") {
    const content = getGitignoreContent(options.gitignore);
    await fsInstance.promises.writeFile(`${dir}/.gitignore`, content);
    filesToAdd.push(".gitignore");
  }

  // LICENSE
  if (options.license) {
    const content = getLicenseContent(options.license, options.authorName);
    await fsInstance.promises.writeFile(`${dir}/LICENSE`, content);
    filesToAdd.push("LICENSE");
  }

  // If no files to add, create a minimal README so the repo isn't empty
  if (filesToAdd.length === 0) {
    await fsInstance.promises.writeFile(`${dir}/README.md`, `# ${options.name}\n`);
    filesToAdd.push("README.md");
  }

  // Stage and commit
  for (const f of filesToAdd) {
    await git.add({ fs: fsInstance, dir, filepath: f });
  }

  await git.commit({
    fs: fsInstance,
    dir,
    message: "Initial commit",
    author: {
      name: options.authorName,
      email: options.authorEmail,
    },
  });
}

// ── Template content ──

function getGitignoreContent(template: string): string {
  const templates: Record<string, string> = {
    Node: `node_modules/\ndist/\n.env\n.env.local\ncoverage/\n*.log\n`,
    Python: `__pycache__/\n*.py[cod]\n*.egg-info/\ndist/\nvenv/\n.env\n`,
    Rust: `target/\nCargo.lock\n*.rs.bk\n`,
    Go: `bin/\n*.exe\n*.test\nvendor/\n`,
    Java: `*.class\n*.jar\ntarget/\n.gradle/\nbuild/\n`,
    C: `*.o\n*.so\n*.a\n*.out\nbuild/\n`,
    "C++": `*.o\n*.so\n*.a\n*.out\nbuild/\n*.d\n`,
    Ruby: `*.gem\n.bundle/\nvendor/bundle/\nGemfile.lock\n`,
    Swift: `.build/\n*.xcodeproj/\n*.xcworkspace/\nPackage.resolved\n`,
    Kotlin: `*.class\nbuild/\n.gradle/\n`,
    Haskell: `dist/\ndist-newstyle/\n.stack-work/\n*.hi\n*.o\n`,
    Elixir: `_build/\ndeps/\n*.ez\n`,
    Dart: `.dart_tool/\n.packages\nbuild/\n`,
  };
  return templates[template] || "";
}

function getLicenseContent(license: string, author: string): string {
  const year = new Date().getFullYear();
  if (license === "MIT") {
    return `MIT License\n\nCopyright (c) ${year} ${author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;
  }
  if (license === "Apache-2.0") {
    return `Copyright ${year} ${author}\n\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an "AS IS" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.\n`;
  }
  if (license === "Unlicense") {
    return `This is free and unencumbered software released into the public domain.\n\nAnyone is free to copy, modify, publish, use, compile, sell, or\ndistribute this software, either in source code form or as a compiled\nbinary, for any purpose, commercial or non-commercial, and by any means.\n`;
  }
  // For other licenses, provide a stub
  return `This project is licensed under the ${license} license.\nSee https://spdx.org/licenses/${license}.html for details.\n`;
}
