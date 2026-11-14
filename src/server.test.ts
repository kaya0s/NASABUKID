import { afterEach, expect, it, vi } from "vitest";
import server from "./server";
import { fixture } from "./test/advisor-fixture";
afterEach(() => vi.unstubAllGlobals());
const request = (body: unknown) =>
  new Request("https://example.test/api/advisor", { method: "POST", body: JSON.stringify(body) });
it("calls only the gateway with server credentials and calculated context", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        { finish_reason: "stop", message: { content: "Your estimate uses sample assumptions." } },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const response = await server.fetch(request(fixture), { LOVABLE_API_KEY: "test-only" }, {});
  expect(response.status).toBe(200);
  expect(fetchMock.mock.calls[0]![0]).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
  const options = fetchMock.mock.calls[0]![1];
  expect(options.headers.Authorization).toBe("Bearer test-only");
  expect(options.body).toContain("103194");
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
  expect((await server.fetch(request(fixture), { LOVABLE_API_KEY: "test-only" }, {})).status).toBe(
    502,
  );
});
