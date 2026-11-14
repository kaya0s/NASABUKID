import "./lib/error-capture";

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
        if (request.headers.get("sec-fetch-site") === "cross-site") return new Response("Forbidden", { status: 403 });
        if (Number(request.headers.get("content-length")) > 10_000) return new Response("Request too large", { status: 413 });
        let body: { question?: unknown; context?: unknown };
        try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
        if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 400 || typeof body.context !== "string" || body.context.length > 2000) return new Response("Invalid question", { status: 400 });
        const key = (env as { GEMINI_API_KEY?: string })?.GEMINI_API_KEY ?? process.env["GEMINI_API_KEY"];
        if (!key) return new Response("GEMINI_API_KEY is not configured on the server", { status: 503 });
        let result: Response;
        try { result = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "You are FieldShift's helpful farm planning guide. Answer in no more than two short sentences and 50 words. The supplied farm context, crop scores, loss estimates, and scenarios are illustrative demo inputs, not verified agronomy or forecasts. Never invent live data or diagnose crop damage. For field-specific decisions, recommend a local agricultural officer briefly." }] },
            contents: [{ role: "user", parts: [{ text: `Demo context: ${body.context}\nQuestion: ${body.question}` }] }],
            generationConfig: { maxOutputTokens: 160 },
          }),
        }); } catch { return new Response("The advisor took too long. Please try again.", { status: 504 }); }
        if (!result.ok) return new Response(result.status === 429 ? "The advisor is busy. Please try again shortly." : "The advisor is unavailable right now.", { status: 502 });
        let data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        try { data = await result.json(); } catch { return new Response("The advisor returned an invalid answer", { status: 502 }); }
        const answer = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
        return answer ? Response.json({ answer }) : new Response("The advisor returned no answer", { status: 502 });
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
