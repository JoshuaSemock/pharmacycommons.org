// api — Pharmacy Commons public, read-only machine interface (v1).
//
// Every record reachable on the website is reachable here as structured JSON(-LD):
//   GET /v1                                   index: entity types, counts, sources, license
//   GET /v1/entities/{ref}[.json|.jsonld]     canonical document (ref = PCID-1001923 | 1001923 | slug | slug URI)
//   GET /v1/drugs/{ref}                       alias of /entities
//   GET /v1/entities/{ref}/versions           version list
//   GET /v1/entities/{ref}/versions/{n}       a past version, immutable
//   GET /v1/entities/{ref}/changes            field-level change log (?limit=, ?before=)
//   GET /v1/entities/{ref}/members            members of a class record (?limit=, ?offset=, ?direct=true)
//   GET /v1/schema/entity.json                JSON Schema for the document
//   GET /v1/context.jsonld                    JSON-LD context
//
// All data comes from public.api_* SQL functions; this file only routes and sets HTTP semantics.
// Deployed with verify_jwt = false: it is a public read API and performs no writes of its own
// (the only write, a content-hash snapshot inside api_entity_document, is deterministic).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CONTEXT, entitySchema } from "./schema.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const API_BASE = Deno.env.get("PC_API_BASE") ?? `${SUPABASE_URL}/functions/v1/api`;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "accept, if-none-match, content-type, authorization, apikey, x-client-info",
  "Access-Control-Expose-Headers": "ETag, Link, X-PCID, X-Version",
};

type Json = Record<string, unknown>;

async function rpc(fn: string, args: Json): Promise<Json> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return (await r.json()) as Json;
}

interface Opts {
  status?: number;
  ld?: boolean;
  compact?: boolean;
  cache?: string;
  etag?: string;
  links?: string[];
  extra?: Record<string, string>;
}

function send(req: Request, body: unknown, o: Opts = {}): Response {
  const status = o.status ?? 200;
  const headers: Record<string, string> = {
    ...CORS,
    "Content-Type": `${o.ld ? "application/ld+json" : "application/json"}; charset=utf-8`,
    "Cache-Control": status === 200 ? (o.cache ?? "public, max-age=300") : "no-store",
    "Vary": "Accept",
    ...(o.extra ?? {}),
  };
  if (o.etag) headers["ETag"] = o.etag;
  if (o.links?.length) headers["Link"] = o.links.join(", ");
  if (o.etag && req.headers.get("if-none-match") === o.etag) {
    return new Response(null, { status: 304, headers });
  }
  const text = JSON.stringify(body, null, o.compact ? undefined : 2);
  return new Response(req.method === "HEAD" ? null : text, { status, headers });
}

function fail(req: Request, status: number, code: string, message: string): Response {
  return send(req, { error: true, status, code, message, docs: `${API_BASE}/v1` }, { status });
}

/** An api_* function returned {error:true,...} — pass its status through. */
function passError(req: Request, j: Json): Response | null {
  if (j && j.error === true) return send(req, j, { status: Number(j.status) || 404 });
  return null;
}

// Postgres jsonb stores keys in its own order; serve documents top-down instead:
// identity first, then data sections, then the envelope.
const DOC_ORDER = [
  "@context", "@id", "@type", "pcid", "pcid_int", "name", "entity_type", "block", "slug", "slug_uri",
  "identifiers", "attributes", "classification", "hierarchy", "relationships", "brands", "labels",
  "fda_applications", "structure", "guidelines", "provenance",
  "version", "links", "license", "api_version", "schema_version", "generated_at",
];
function ordered(doc: Json): Json {
  const out: Json = {};
  for (const k of DOC_ORDER) if (k in doc) out[k] = doc[k];
  for (const k of Object.keys(doc)) if (!(k in out)) out[k] = doc[k];
  return out;
}

function documentHeaders(doc: Json) {
  const links = (doc.links ?? {}) as Record<string, string>;
  const version = (doc.version ?? {}) as Record<string, unknown>;
  return {
    etag: version.hash ? `W/"${version.hash}"` : undefined,
    links: [
      links.canonical && `<${links.canonical}>; rel="canonical"`,
      links.html && `<${links.html}>; rel="alternate"; type="text/html"`,
      links.schema && `<${links.schema}>; rel="describedby"; type="application/schema+json"`,
      links.versions && `<${links.versions}>; rel="version-history"`,
    ].filter(Boolean) as string[],
    extra: {
      "X-PCID": String(doc.pcid ?? ""),
      "X-Version": String(version.number ?? ""),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return fail(req, 405, "method_not_allowed", "This API is read-only: use GET.");
  }

  const url = new URL(req.url);
  // Works both at /functions/v1/api/... (Supabase) and /api/... (behind a site proxy).
  const at = url.pathname.indexOf("/api/");
  const path = at >= 0 ? url.pathname.slice(at + 4) : url.pathname.endsWith("/api") ? "/" : url.pathname;
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const q = url.searchParams;
  const accept = req.headers.get("accept") ?? "";
  const compact = q.get("compact") === "1" || q.get("compact") === "true";

  try {
    if (parts.length === 0) {
      return new Response(null, { status: 302, headers: { ...CORS, Location: `${API_BASE}/v1` } });
    }
    if (parts[0] !== "v1") return fail(req, 404, "unknown_version", "Only /v1 exists.");

    // /v1
    if (parts.length === 1) {
      const index = await rpc("api_index", {});
      return send(req, {
        ...index,
        endpoints: {
          entity: `${API_BASE}/v1/entities/{PCID|slug}`,
          entity_json: `${API_BASE}/v1/entities/PCID-1001923.json`,
          drug_alias: `${API_BASE}/v1/drugs/{PCID|slug}`,
          versions: `${API_BASE}/v1/entities/{PCID}/versions`,
          version: `${API_BASE}/v1/entities/{PCID}/versions/{n}`,
          changes: `${API_BASE}/v1/entities/{PCID}/changes?limit=50&before={change_id}`,
          class_members: `${API_BASE}/v1/entities/{class PCID}/members?limit=100&offset=0&direct=true`,
          schema: `${API_BASE}/v1/schema/entity.json`,
          context: `${API_BASE}/v1/context.jsonld`,
        },
        identifiers:
          "PCID is the only native key. Slugs and slug URIs resolve to it; permanent IRIs are https://pharmacycommons.org/id/PCID-n.",
      }, { compact });
    }

    // /v1/schema/entity.json, /v1/context.jsonld
    if (parts[1] === "schema" && parts[2] === "entity.json" && parts.length === 3) {
      return send(req, entitySchema(API_BASE), {
        compact,
        cache: "public, max-age=3600",
        extra: { "Content-Type": "application/schema+json; charset=utf-8" },
      });
    }
    if (parts[1] === "context.jsonld" && parts.length === 2) {
      return send(req, CONTEXT, { ld: true, compact, cache: "public, max-age=3600" });
    }

    // /v1/entities/{ref}/... and /v1/drugs/{ref}/...
    if ((parts[1] === "entities" || parts[1] === "drugs") && parts.length >= 3) {
      const rawRef = parts[2];
      const ld = /\.jsonld$/i.test(rawRef) || accept.includes("application/ld+json");
      const ref = rawRef.replace(/\.(jsonld|json)$/i, "");
      const sub = parts[3];

      if (!sub) {
        const doc = await rpc("api_entity_document", { p_ref: ref });
        const err = passError(req, doc);
        if (err) return err;
        return send(req, ordered(doc), { ld, compact, ...documentHeaders(doc) });
      }

      if (sub === "versions" && parts.length === 4) {
        const v = await rpc("api_entity_versions", { p_ref: ref });
        return passError(req, v) ?? send(req, v, { compact, cache: "public, max-age=60" });
      }

      if (sub === "versions" && parts.length === 5) {
        const n = Number(parts[4].replace(/\.(jsonld|json)$/i, ""));
        if (!Number.isInteger(n) || n < 1) return fail(req, 400, "bad_version", "Version must be a positive integer.");
        const doc = await rpc("api_entity_document", { p_ref: ref, p_version: n });
        const err = passError(req, doc);
        if (err) return err;
        // A numbered version never changes.
        return send(req, ordered(doc), { ld, compact, cache: "public, max-age=31536000, immutable", ...documentHeaders(doc) });
      }

      if (sub === "changes" && parts.length === 4) {
        const limit = q.get("limit") ? Number(q.get("limit")) : 50;
        const before = q.get("before") ? Number(q.get("before")) : null;
        const c = await rpc("api_entity_changes", { p_ref: ref, p_limit: limit, p_before: before });
        return passError(req, c) ?? send(req, c, { compact, cache: "public, max-age=60" });
      }

      if (sub === "members" && parts.length === 4) {
        const m = await rpc("api_class_members", {
          p_ref: ref,
          p_limit: q.get("limit") ? Number(q.get("limit")) : 100,
          p_offset: q.get("offset") ? Number(q.get("offset")) : 0,
          p_direct_only: q.get("direct") === "true" || q.get("direct") === "1",
        });
        return passError(req, m) ?? send(req, m, { compact, cache: "public, max-age=3600" });
      }
    }

    return fail(req, 404, "unknown_route", `No endpoint at ${path}. See ${API_BASE}/v1 for the list.`);
  } catch (e) {
    console.error(e);
    return fail(req, 502, "upstream_error", "The database did not answer. Try again shortly.");
  }
});
