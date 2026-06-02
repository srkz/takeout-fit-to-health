/**
 * Deterministic sample identifiers.
 *
 * The iOS app stamps these onto HKMetadataKeySyncIdentifier so that importing
 * the same export twice updates rather than duplicates samples. The id must
 * therefore be a pure function of the sample's identifying content, and stable
 * across runs and machines — so we use a plain FNV-1a hash rather than a random
 * UUID or anything timing-dependent.
 */

/** 64-bit FNV-1a hash, returned as a 16-char lowercase hex string. */
export function fnv1a64(input: string): string {
  // FNV-1a 64-bit constants, computed with BigInt to avoid 32-bit overflow.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Builds a stable id for a quantity sample from its identifying fields. */
export function makeQuantityId(
  type: string,
  start: string,
  end: string,
  value: number,
): string {
  return fnv1a64(`q|${type}|${start}|${end}|${value}`);
}

/** Builds a stable id for a workout from its identifying fields. */
export function makeWorkoutId(
  activityType: string,
  start: string,
  end: string,
): string {
  return fnv1a64(`w|${activityType}|${start}|${end}`);
}
