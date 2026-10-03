import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { KokoroTts } from "./kokoro";

const IDLE_EXIT_SECONDS = 120;
const KEEPALIVE_MS = 30000;

// Inicia o serviço de voz (tts/server.py) junto com o servidor, se ele ainda não estiver no ar.
// O serviço fica vivo entre recargas do `npm run dev` e se encerra sozinho quando o servidor para de consultá-lo.
export async function startKokoroService(tts: KokoroTts, baseUrl: string): Promise<void> {
  const url = new URL(baseUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) return;

  const python = path.join(process.cwd(), "tts", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (!fs.existsSync(python)) {
    console.warn("Voz: ambiente do Kokoro não encontrado em tts/.venv (veja a seção Voz do README).");
    return;
  }

  setInterval(() => void tts.available(), KEEPALIVE_MS).unref();

  if (await tts.available()) {
    console.log(`Voz: Kokoro já estava rodando em ${baseUrl}`);
    return;
  }

  const child = spawn(python, [path.join("tts", "server.py")], {
    env: {
      ...process.env,
      KOKORO_HOST: url.hostname,
      KOKORO_PORT: url.port || "8880",
      KOKORO_IDLE_EXIT_S: String(IDLE_EXIT_SECONDS),
      PYTHONIOENCODING: "utf-8"
    },
    stdio: "ignore",
    detached: true,
    windowsHide: true
  });
  child.on("error", (error) => console.warn(`Voz: não foi possível iniciar o Kokoro: ${error.message}`));
  child.unref();

  console.log("Voz: iniciando o Kokoro (leva alguns segundos)...");
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await tts.available()) {
      console.log(`Voz: Kokoro pronto em ${baseUrl}`);
      return;
    }
  }
  console.warn("Voz: o Kokoro não respondeu; rode `npm run tts` para ver o erro.");
}
