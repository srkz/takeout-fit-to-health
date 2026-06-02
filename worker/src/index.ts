/**
 * Cloudflare Worker entry point.
 *
 * The iOS app POSTs the raw Google Takeout .zip to /api/convert and gets back
 * a NormalizedPayload it can feed to HealthKit. The Worker is stateless: it
 * holds the upload in memory only for the duration of the request and stores
 * nothing — the user's health data never persists on our infrastructure.
 */

import { convertArchive } from "./convert/normalize.js";

export interface Env {
  /** Optional upload cap in bytes; defaults to 100 MB. */
  MAX_UPLOAD_BYTES?: string;
}

const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "takeout-fit-to-health", endpoint: "/api/convert" });
    }

    if (url.pathname === "/api/convert") {
      if (request.method !== "POST") {
        return json({ error: "method not allowed; use POST" }, 405);
      }

      const maxBytes = Number(env.MAX_UPLOAD_BYTES) || DEFAULT_MAX_UPLOAD_BYTES;
      const declared = Number(request.headers.get("content-length") ?? "0");
      if (declared > maxBytes) {
        return json({ error: `upload exceeds limit of ${maxBytes} bytes` }, 413);
      }

      let bytes: Uint8Array;
      try {
        const buf = await request.arrayBuffer();
        bytes = new Uint8Array(buf);
      } catch {
        return json({ error: "could not read request body" }, 400);
      }
      if (bytes.length === 0) {
        return json({ error: "empty body; POST the Takeout .zip as the request body" }, 400);
      }
      if (bytes.length > maxBytes) {
        return json({ error: `upload exceeds limit of ${maxBytes} bytes` }, 413);
      }

      try {
        const payload = convertArchive(bytes);
        return json(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        return json({ error: `failed to parse archive: ${message}` }, 422);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
