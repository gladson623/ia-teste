interface KokoroConfig {
  baseUrl: string;
  voice: string;
  timeoutMs: number;
}

// Vozes aceitas por tts/server.py: as três primeiras são nativas do Brasil; af_bella só entra em misturas.
export const KOKORO_VOICES = ["pm_alex", "pf_dora", "pm_santa", "af_bella"] as const;

// Uma voz ou uma mistura de vozes separadas por vírgula (ex.: "pf_dora,af_bella").
export const isKokoroVoice = (voice: string) =>
  voice.split(",").every((part) => (KOKORO_VOICES as readonly string[]).includes(part));

// Tira o que não deve ser lido em voz alta: marcação markdown, links e emojis.
export function speakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_`#>|~]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Cliente do serviço local de voz (tts/server.py, Kokoro-82M).
export class KokoroTts {
  constructor(private readonly config: KokoroConfig) {}

  async available(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Devolve o áudio em WAV.
  async synthesize(text: string, voice = this.config.voice): Promise<Buffer> {
    const speakable = speakableText(text);
    if (!speakable) {
      throw new Error("Nada para falar");
    }

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speakable, voice }),
        signal: AbortSignal.timeout(this.config.timeoutMs)
      });
    } catch (error) {
      if ((error as Error).name === "TimeoutError") {
        throw new Error(`Kokoro não respondeu em ${this.config.timeoutMs}ms (ajuste KOKORO_TIMEOUT_MS)`);
      }
      throw new Error(`Serviço de voz inacessível em ${this.config.baseUrl} (rode: npm run tts)`);
    }

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(`Falha no Kokoro: ${detail?.error ?? response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
