import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./assistant";

function createResponse() {
  let statusCode = 200;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
    },
  };
  return {
    response,
    result: () => ({ statusCode, body }),
  };
}

const validRequest = {
  question: "What are Pikachu's strengths?",
  locale: "en",
  history: [],
  pokemon: [{
    name: "pikachu",
    number: 25,
    types: ["electric"],
    abilities: ["static"],
    stats: [{ name: "speed", value: 90 }],
    heightMeters: 0.4,
    weightKg: 6,
  }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("assistant serverless handler", () => {
  it("rejects non-POST requests", async () => {
    const output = createResponse();
    await handler({ method: "GET" }, output.response);
    expect(output.result()).toEqual({
      statusCode: 405,
      body: { error: "method_not_allowed" },
    });
  });

  it("rejects invalid input before contacting the provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const output = createResponse();

    await handler({
      method: "POST",
      body: { ...validRequest, pokemon: [{ ...validRequest.pokemon[0], types: ["unknown"] }] },
    }, output.response);

    expect(output.result()).toEqual({
      statusCode: 400,
      body: { error: "invalid_request" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports missing server credentials without making a provider request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const output = createResponse();

    await handler({ method: "POST", body: validRequest }, output.response);

    expect(output.result()).toEqual({
      statusCode: 503,
      body: { error: "assistant_not_configured" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a provider answer using only the validated request context", async () => {
    vi.stubEnv("OPENAI_API_KEY", "server-only-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Pikachu is fast." } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const output = createResponse();

    await handler({ method: "POST", body: validRequest }, output.response);

    expect(output.result()).toEqual({
      statusCode: 200,
      body: { answer: "Pikachu is fast." },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer server-only-test-key",
    });
    const requestBody = JSON.parse(options.body as string) as {
      messages: { content: string }[];
    };
    expect(requestBody.messages.at(-1)?.content).toContain('"name":"pikachu"');
  });
});
