import { afterEach, expect, it, vi } from "vitest";
import server from "./server";
import { fixture } from "./test/advisor-fixture";
afterEach(() => vi.unstubAllGlobals());
const request = (body: unknown) =>
  new Request("https://example.test/api/advisor", { method: "POST", body: JSON.stringify(body) });
it("calls Google directly with server credentials and calculated context", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        { finish_reason: "stop", message: { content: "Your estimate uses sample assumptions." } },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const response = await server.fetch(request(fixture), { GEMINI_API_KEY: "test-only" }, {});
  expect(response.status).toBe(200);
  expect(fetchMock.mock.calls[0]![0]).toBe(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  );
  const options = fetchMock.mock.calls[0]![1];
  expect(options.headers.Authorization).toBe("Bearer test-only");
  expect(options.body).toContain("103194");
  expect(JSON.parse(options.body).reasoning_effort).toBe("low");
});

it("allows a minute for the provider to respond", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: "Answer" } }] })),
  );
  try {
    expect((await server.fetch(request(fixture), { GEMINI_API_KEY: "test-only" }, {})).status).toBe(
      200,
    );
    expect(timeout).toHaveBeenCalledWith(60_000);
  } finally {
    timeout.mockRestore();
  }
});

it.each([
  [new DOMException("Timed out", "TimeoutError"), 504, "took too long"],
  [new TypeError("fetch failed"), 502, "could not reach Google"],
])(
  "distinguishes provider timeouts from connection failures (%s)",
  async (error, status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    const response = await server.fetch(request(fixture), { GEMINI_API_KEY: "test-only" }, {});
    expect(response.status).toBe(status);
    expect(await response.text()).toContain(message);
  },
);

it.each([429, 503])("reports provider capacity errors (%s) as busy", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
  const response = await server.fetch(request(fixture), { GEMINI_API_KEY: "test-only" }, {});
  expect(response.status).toBe(502);
  expect(await response.text()).toContain("advisor is busy");
});
it("rejects oversized and malformed payloads without calling a provider", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(
    (await server.fetch(request({ ...fixture, question: "x".repeat(81000) }), {}, {})).status,
  ).toBe(413);
  expect((await server.fetch(request(null), {}, {})).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not return a truncated answer as complete", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ choices: [{ finish_reason: "length", message: { content: "Partial" } }] }),
      ),
  );
  expect((await server.fetch(request(fixture), { GEMINI_API_KEY: "test-only" }, {})).status).toBe(
    502,
  );
});

it("reports a missing Google key without making a provider request", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  try {
    const response = await server.fetch(request(fixture), {}, {});
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("GEMINI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
