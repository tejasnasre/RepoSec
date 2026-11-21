/**
 * Centralized Gemini client (REST). The only AI provider in this product.
 * Model, key and search flag come from env; nothing else hardcodes a model name.
 */
export type Part = {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  [k: string]: unknown; // keep thought signatures etc. intact when replaying history
};
export type Content = { role: "user" | "model"; parts: Part[] };

export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, any>) => Promise<unknown>;
};

export const geminiConfig = () => ({
  apiKey: process.env.GEMINI_API_KEY ?? "",
  model: process.env.GEMINI_MODEL ?? "",
  searchEnabled: process.env.GEMINI_SEARCH_ENABLED === "true",
});

export const geminiAvailable = () => !!geminiConfig().apiKey && !!geminiConfig().model;

// Quota awareness: cap concurrent requests process-wide.
let inflight = 0;
const waiters: (() => void)[] = [];
async function acquire() {
  const max = Number(process.env.GEMINI_MAX_CONCURRENCY ?? 3);
  if (inflight >= max) await new Promise<void>((r) => waiters.push(r));
  inflight++;
}
function release() {
  inflight--;
  waiters.shift()?.();
}

async function post(body: unknown): Promise<any> {
  const { apiKey, model } = geminiConfig();
  await acquire();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) return await res.json();
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string; details?: { retryDelay?: string }[] } };
      if ((res.status === 429 || res.status === 503) && attempt < 3) {
        const hinted = Number(err.error?.details?.find((d) => d.retryDelay)?.retryDelay?.replace("s", "")) || 0;
        await new Promise((r) => setTimeout(r, Math.min(Math.max(hinted, 2 ** attempt * 2), 30) * 1000));
        continue;
      }
      throw new Error(`Gemini ${res.status}: ${err.error?.message?.slice(0, 300) ?? "request failed"}`);
    }
    throw new Error("Gemini request failed after retries");
  } finally {
    release();
  }
}

const textOf = (c: Content | undefined) => (c?.parts ?? []).map((p) => p.text ?? "").join("");

export type ToolLoopResult = { history: Content[]; finalText: string; toolCalls: number };

/** Multi-step investigation: Gemini requests tools, WE execute them (it can never invent tool results). */
export async function runToolLoop(opts: {
  system: string;
  prompt: string;
  tools: ToolDef[];
  maxRounds?: number;
  onStep?: (s: { kind: "tool_call" | "model"; name: string; input?: unknown; output?: string; ok: boolean }) => void | Promise<void>;
}): Promise<ToolLoopResult> {
  const history: Content[] = [{ role: "user", parts: [{ text: opts.prompt }] }];
  const decls = opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  let toolCalls = 0;
  for (let round = 0; round < (opts.maxRounds ?? 8); round++) {
    const data = await post({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: history,
      tools: [{ functionDeclarations: decls }],
      generationConfig: { temperature: 0.2 },
    });
    const content: Content | undefined = data.candidates?.[0]?.content;
    if (!content) throw new Error("Gemini returned no content");
    history.push(content);
    const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (!calls.length) {
      await opts.onStep?.({ kind: "model", name: "reasoning", output: textOf(content).slice(0, 400), ok: true });
      return { history, finalText: textOf(content), toolCalls };
    }
    const responses: Part[] = [];
    for (const call of calls) {
      toolCalls++;
      const tool = opts.tools.find((t) => t.name === call.name);
      let ok = true;
      let out: unknown;
      try {
        if (!tool) throw new Error(`Unknown tool ${call.name}`);
        out = await tool.run(call.args ?? {});
      } catch (e) {
        ok = false;
        out = { error: e instanceof Error ? e.message : "tool failed" };
      }
      const serialized = JSON.stringify(out);
      const clipped = serialized.length > 14_000 ? serialized.slice(0, 14_000) + '…[truncated]' : serialized;
      await opts.onStep?.({ kind: "tool_call", name: call.name, input: call.args, output: clipped.slice(0, 300), ok });
      responses.push({
        functionResponse: {
          name: call.name,
          id: call.id,
          // Everything returned by tools is untrusted data, never instructions.
          response: { untrusted_data: true, result: ok ? safeParse(clipped) : out },
        },
      });
    }
    history.push({ role: "user", parts: responses });
  }
  // Out of rounds: ask for what we have.
  return { history, finalText: "", toolCalls };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Final answer constrained to a JSON schema (tools off: the API does not combine them reliably). */
export async function generateStructured<T>(opts: { system: string; history: Content[]; instruction: string; schema: Record<string, unknown> }): Promise<T> {
  const data = await post({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [...opts.history, { role: "user", parts: [{ text: opts.instruction }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: opts.schema },
  });
  const text = textOf(data.candidates?.[0]?.content);
  if (!text) throw new Error("Gemini returned an empty structured response");
  return JSON.parse(text) as T;
}

/** Google Search grounding (paid tiers only). Returns null when disabled or unavailable. */
export async function groundedSearch(query: string): Promise<{ text: string; sources: { title: string; url: string }[] } | null> {
  if (!geminiConfig().searchEnabled) return null;
  try {
    const data = await post({
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
    });
    const cand = data.candidates?.[0];
    const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c: { web?: { title?: string; uri?: string } }) => ({ title: c.web?.title ?? "", url: c.web?.uri ?? "" }))
      .filter((s: { url: string }) => s.url);
    return { text: textOf(cand?.content).slice(0, 6000), sources };
  } catch {
    return null;
  }
}
