import test from "node:test";
import assert from "node:assert/strict";
import { KokoroTts, speakableText } from "../src/voice/kokoro";

const tts = () => new KokoroTts({ baseUrl: "http://kokoro.test", voice: "pm_alex", timeoutMs: 1000 });

test("speakableText removes markdown, links and emojis", () => {
  assert.equal(speakableText("**Olá!** Veja [o site](https://exemplo.com) 😀\n# Título"), "Olá! Veja o site Título");
});

test("kokoro client sends the cleaned text and voice and returns the wav bytes", async (t) => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = (async (url: string, init: { body: string }) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode("RIFF").buffer };
  }) as unknown as typeof fetch;

  const audio = await tts().synthesize("**Olá**, senhor!");

  assert.equal(audio.toString(), "RIFF");
  assert.deepEqual(requests, [{ url: "http://kokoro.test/tts", body: { text: "Olá, senhor!", voice: "pm_alex" } }]);
});

test("kokoro client explains how to start the service when it is down", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

  await assert.rejects(tts().synthesize("oi"), /npm run tts/);
  assert.equal(await tts().available(), false);
  await assert.rejects(tts().synthesize("😀"), /Nada para falar/);
});
