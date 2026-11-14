import "./lib/error-capture";
import { advisorRequestSchema, buildAdvisorMessages } from "./lib/advisor";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (new URL(request.url).pathname === "/api/advisor") {
        if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
        if (request.headers.get("sec-fetch-site") === "cross-site")
          return new Response("Forbidden", { status: 403 });
        // Bound actual bytes even when Content-Length is missing or dishonest.
        const reader = request.body?.getReader();
        if (!reader) return new Response("Invalid request", { status: 400 });
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 80_000) {
            await reader.cancel();
            return new Response("Request too large", { status: 413 });
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const parsed = advisorRequestSchema.safeParse(payload);
        if (!parsed.success)
          return new Response("Invalid advisor inputs. Check your field details.", { status: 400 });
        let messages;
        try {
          messages = buildAdvisorMessages(parsed.data);
        } catch {
          return new Response("Loss assumptions exceed the supported range.", { status: 400 });
        }
        const key =
          (env as { GEMINI_API_KEY?: string })?.GEMINI_API_KEY ?? process.env["GEMINI_API_KEY"];
        if (!key)
          return new Response(
            "The advisor is not configured. Set GEMINI_API_KEY in the server environment.",
            { status: 503 },
          );
        let result: Response;
        try {
          result = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            {
              method: "POST",
              signal: AbortSignal.timeout(60_000),
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
              body: JSON.stringify({
                model: "gemini-3.1-flash-lite",
                messages,
                reasoning_effort: "low",
                max_tokens: 1500,
              }),
            },
          );
        } catch (error) {
          const timedOut =
            (error instanceof Error || error instanceof DOMException) &&
            error.name === "TimeoutError";
          return new Response(
            timedOut
              ? "The advisor took too long to respond. Please try again."
              : "The advisor could not reach Google. Please try again shortly.",
            { status: timedOut ? 504 : 502 },
          );
        }
        if (!result.ok)
          return new Response(
            result.status === 429 || result.status === 503
              ? "The advisor is busy. Please try again shortly."
              : result.status === 402
                ? "The advisor’s provider billing is unavailable. Contact the project owner."
                : "The advisor is unavailable right now.",
            { status: 502 },
          );
        let data: { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }> };
        try {
          data = await result.json();
        } catch {
          return new Response("The advisor returned an invalid answer", { status: 502 });
        }
        const choice = data.choices?.[0];
        if (choice?.finish_reason === "length")
          return new Response("The answer was incomplete. Please ask a narrower question.", {
            status: 502,
          });
        const answer =
          typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
        return answer
          ? Response.json({ answer })
          : new Response("The advisor returned no answer", { status: 502 });
      }
      const reqUrl = new URL(request.url);
      if (request.method === "GET" && reqUrl.pathname === "/api/streetview") {
        const lat = Number(reqUrl.searchParams.get("lat"));
        const lon = Number(reqUrl.searchParams.get("lon"));
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          lat < -90 ||
          lat > 90 ||
          lon < -180 ||
          lon > 180
        ) {
          return new Response("Invalid coordinates", { status: 400 });
        }
        const mapillaryToken =
          (env as { MAPILLARY_ACCESS_TOKEN?: string })?.MAPILLARY_ACCESS_TOKEN ??
          process.env["MAPILLARY_ACCESS_TOKEN"];

        let photoUrl: string | undefined;

        if (mapillaryToken) {
          const delta = 0.005;
          const mUrl = new URL("https://graph.mapillary.com/images");
          mUrl.searchParams.set("access_token", mapillaryToken);
          mUrl.searchParams.set("fields", "id,thumb_1024_url");
          mUrl.searchParams.set(
            "bbox",
            `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`,
          );
          mUrl.searchParams.set("limit", "1");
          try {
            const mRes = await fetch(mUrl, { signal: AbortSignal.timeout(7_000) });
            if (mRes.ok) {
              const mData = (await mRes.json()) as {
                data?: Array<{ thumb_1024_url?: string }>;
              };
              photoUrl = mData.data?.[0]?.thumb_1024_url;
            }
          } catch {
            // Fall through to KartaView
          }
        }

        if (!photoUrl) {
          const kUrl = new URL("https://api.kartaview.org/2.0/photo/");
          kUrl.searchParams.set("lat", String(lat));
          kUrl.searchParams.set("lng", String(lon));
          kUrl.searchParams.set("radius", "500");
          try {
            const kRes = await fetch(kUrl, { signal: AbortSignal.timeout(7_000) });
            if (kRes.ok) {
              const kData = (await kRes.json()) as {
                result?: {
                  data?: Array<{ fileurlLTh?: string; fileurlProc?: string; fileurl?: string }>;
                };
              };
              const first = kData.result?.data?.[0];
              photoUrl = first?.fileurlLTh || first?.fileurlProc || first?.fileurl;
            }
          } catch {
            // Handled below
          }
        }

        if (!photoUrl) {
          return new Response("No street-level coverage nearby", { status: 404 });
        }

        const imgRes = await fetch(photoUrl, { signal: AbortSignal.timeout(10_000) });
        if (!imgRes.ok || !imgRes.body) {
          return new Response("Street-level image unavailable", { status: 502 });
        }
        return new Response(imgRes.body, {
          status: 200,
          headers: {
            "Content-Type": imgRes.headers.get("Content-Type") || "image/jpeg",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
