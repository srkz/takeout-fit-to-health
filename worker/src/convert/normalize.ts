/**
 * Orchestrates the full Takeout-zip -> NormalizedPayload conversion.
 *
 * Routing is by path segment, case-insensitively, and tolerant of the
 * localized "Fit" folder name and an optional "Takeout/" prefix:
 *
 *   .../All Data/*.json      -> quantity time-series      (parseAllDataFile)
 *   .../All Sessions/*.json  -> workouts                  (parseSessionFile)
 *   .../Daily activity metrics/*.csv -> skipped (would duplicate All Data)
 *   .../Activities/*.tcx     -> skipped (GPS detail; workout already captured)
 *
 * We deliberately do NOT import the Daily-activity CSV summaries: they are
 * day-level rollups of the same numbers already present at full resolution in
 * All Data, and importing both would double-count steps/distance/energy in
 * HealthKit.
 */

import { parseAllDataFile } from "../parser/allData.js";
import { parseSessionFile } from "../parser/sessions.js";
import { unzip, decodeText, type ZipEntry } from "../parser/zip.js";
import {
  PAYLOAD_VERSION,
  SOURCE_NAME,
  type NormalizedPayload,
  type Sample,
  type SkippedNote,
} from "../types.js";

/** Lowercased path test that ignores the leading directory components. */
function inFolder(path: string, folder: string): boolean {
  return path.toLowerCase().includes(`/${folder.toLowerCase()}/`) ||
    path.toLowerCase().startsWith(`${folder.toLowerCase()}/`);
}

function hasExt(path: string, ext: string): boolean {
  return path.toLowerCase().endsWith(ext.toLowerCase());
}

/** Converts already-extracted zip entries into a normalized payload. */
export function convertEntries(entries: ZipEntry[]): NormalizedPayload {
  // Dedup by stable id as we go; importing the same export twice (or a
  // session that overlaps an All-Data point) must not produce duplicates.
  const byId = new Map<string, Sample>();
  const skipped: SkippedNote[] = [];

  for (const entry of entries) {
    const { path } = entry;

    if (inFolder(path, "All Data") && hasExt(path, ".json")) {
      const { samples, skipped: s } = parseAllDataFile(path, decodeText(entry.bytes));
      for (const sample of samples) byId.set(sample.id, sample);
      skipped.push(...s);
      continue;
    }

    if (inFolder(path, "All Sessions") && hasExt(path, ".json")) {
      const { workout, skipped: s } = parseSessionFile(path, decodeText(entry.bytes));
      if (workout) byId.set(workout.id, workout);
      skipped.push(...s);
      continue;
    }

    if (inFolder(path, "Daily activity metrics") && hasExt(path, ".csv")) {
      skipped.push({ file: path, reason: "daily CSV summary skipped (duplicates All Data)" });
      continue;
    }

    if (inFolder(path, "Activities") && hasExt(path, ".tcx")) {
      skipped.push({ file: path, reason: "TCX GPS track skipped (workout captured from session)" });
      continue;
    }
    // Anything else (metadata, archive_browser.html, etc.) is silently ignored.
  }

  const samples = [...byId.values()];

  const summary: Record<string, number> = {};
  for (const sample of samples) {
    const key = sample.kind === "workout" ? `workout:${sample.activityType}` : sample.type;
    summary[key] = (summary[key] ?? 0) + 1;
  }

  return {
    version: PAYLOAD_VERSION,
    source: SOURCE_NAME,
    summary,
    skipped,
    samples,
  };
}

/** Top-level: unzip a Takeout archive and convert it. */
export function convertArchive(archive: Uint8Array): NormalizedPayload {
  return convertEntries(unzip(archive));
}
