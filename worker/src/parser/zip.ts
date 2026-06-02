/**
 * Zip extraction for the Takeout archive.
 *
 * fflate's unzipSync is pure JS and runs in the Workers runtime (no Node
 * builtins). It decompresses into memory, so very large exports are bounded by
 * Worker memory limits — see docs/ARCHITECTURE.md for the R2-streaming path we
 * leave as future work.
 */

import { unzipSync } from "fflate";

export interface ZipEntry {
  /** Full path within the archive, e.g. "Takeout/Fit/All Data/foo.json". */
  path: string;
  bytes: Uint8Array;
}

/** Unzips an archive into a flat list of entries (directories omitted). */
export function unzip(archive: Uint8Array): ZipEntry[] {
  const files = unzipSync(archive);
  const entries: ZipEntry[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    // Directory entries come back as zero-length; skip them.
    if (path.endsWith("/") || bytes.length === 0) continue;
    entries.push({ path, bytes });
  }
  return entries;
}

const decoder = new TextDecoder("utf-8");

/** Decodes an entry's bytes as UTF-8 text. */
export function decodeText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}
