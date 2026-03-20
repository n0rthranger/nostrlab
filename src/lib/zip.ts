import type { FileBlobEvent } from "../types/nostr";

/**
 * Minimal ZIP file generator using raw binary construction.
 * Produces a valid ZIP archive without external dependencies.
 */

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

interface ZipEntry {
  path: string;
  content: Uint8Array;
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: { localHeader: Uint8Array; data: Uint8Array; centralHeader: Uint8Array; offset: number }[] = [];

  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.content);
    const size = entry.content.length;

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUint32LE(localHeader, 0, 0x04034b50); // local file header signature
    writeUint16LE(localHeader, 4, 20);          // version needed to extract
    writeUint16LE(localHeader, 6, 0);           // general purpose bit flag
    writeUint16LE(localHeader, 8, 0);           // compression method (0 = stored)
    writeUint16LE(localHeader, 10, 0);          // last mod file time
    writeUint16LE(localHeader, 12, 0);          // last mod file date
    writeUint32LE(localHeader, 14, crc);        // crc-32
    writeUint32LE(localHeader, 18, size);       // compressed size
    writeUint32LE(localHeader, 22, size);       // uncompressed size
    writeUint16LE(localHeader, 26, nameBytes.length); // file name length
    writeUint16LE(localHeader, 28, 0);          // extra field length
    localHeader.set(nameBytes, 30);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32LE(centralHeader, 0, 0x02014b50); // central directory header signature
    writeUint16LE(centralHeader, 4, 20);          // version made by
    writeUint16LE(centralHeader, 6, 20);          // version needed to extract
    writeUint16LE(centralHeader, 8, 0);           // general purpose bit flag
    writeUint16LE(centralHeader, 10, 0);          // compression method
    writeUint16LE(centralHeader, 12, 0);          // last mod file time
    writeUint16LE(centralHeader, 14, 0);          // last mod file date
    writeUint32LE(centralHeader, 16, crc);        // crc-32
    writeUint32LE(centralHeader, 20, size);       // compressed size
    writeUint32LE(centralHeader, 24, size);       // uncompressed size
    writeUint16LE(centralHeader, 28, nameBytes.length); // file name length
    writeUint16LE(centralHeader, 30, 0);          // extra field length
    writeUint16LE(centralHeader, 32, 0);          // file comment length
    writeUint16LE(centralHeader, 34, 0);          // disk number start
    writeUint16LE(centralHeader, 36, 0);          // internal file attributes
    writeUint32LE(centralHeader, 38, 0);          // external file attributes
    writeUint32LE(centralHeader, 42, offset);     // relative offset of local header
    centralHeader.set(nameBytes, 46);

    parts.push({ localHeader, data: entry.content, centralHeader, offset });
    offset += localHeader.length + entry.content.length;
  }

  // Calculate total size
  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const p of parts) centralDirSize += p.centralHeader.length;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  writeUint32LE(eocd, 0, 0x06054b50);            // end of central dir signature
  writeUint16LE(eocd, 4, 0);                      // number of this disk
  writeUint16LE(eocd, 6, 0);                      // disk where central dir starts
  writeUint16LE(eocd, 8, parts.length);            // number of entries on this disk
  writeUint16LE(eocd, 10, parts.length);           // total number of entries
  writeUint32LE(eocd, 12, centralDirSize);         // size of central directory
  writeUint32LE(eocd, 16, centralDirOffset);       // offset of start of central directory
  writeUint16LE(eocd, 20, 0);                      // comment length

  const totalSize = centralDirOffset + centralDirSize + eocd.length;
  const result = new Uint8Array(totalSize);
  let pos = 0;

  // Write local file headers + data
  for (const p of parts) {
    result.set(p.localHeader, pos);
    pos += p.localHeader.length;
    result.set(p.data, pos);
    pos += p.data.length;
  }

  // Write central directory headers
  for (const p of parts) {
    result.set(p.centralHeader, pos);
    pos += p.centralHeader.length;
  }

  // Write end of central directory
  result.set(eocd, pos);

  return result;
}

function sanitizeZipPath(path: string): string | null {
  // Prevent zip slip: strip leading slashes, reject path traversal
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) return null;
  // Reject absolute Windows paths like C:
  if (/^[a-zA-Z]:/.test(normalized)) return null;
  return normalized;
}

export function downloadZipFromEntries(repoName: string, entries: ZipEntry[]): void {
  const zipData = buildZip(entries);
  const blob = new Blob([new Uint8Array(zipData)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${repoName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadRepoZip(repoName: string, files: FileBlobEvent[]): void {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  for (const f of files) {
    const safePath = sanitizeZipPath(f.filePath);
    if (!safePath) continue; // skip unsafe paths
    entries.push({ path: safePath, content: encoder.encode(f.content) });
  }

  const zipData = buildZip(entries);
  const blob = new Blob([new Uint8Array(zipData)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${repoName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
