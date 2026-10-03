import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { speakableText } from "../voice/kokoro";
import { UnityCommand, UnityCommandResult, UnityWorld } from "./actions";

// Ponte entre o cérebro e o corpo (Unity). O transporte (WebSocket) fica no servidor:
// ele escuta o evento "command" para transmitir e entrega aqui as mensagens que o Unity manda.
export class UnityBridge extends EventEmitter {
  private readonly bodies = new Set<unknown>();
  private world: UnityWorld | null = null;

  getState() {
    return { connected: this.bodies.size > 0, bodies: this.bodies.size, world: this.world };
  }

  // Envia o comando e espera a resposta do corpo; devolve null se nenhum corpo responder a tempo.
  send(command: UnityCommand, timeoutMs = 3000): Promise<{ id: string; result: UnityCommandResult | null }> {
    const id = randomUUID();

    return new Promise((resolve) => {
      const onResult = (result: UnityCommandResult) => {
        if (result.id !== id) return;
        clearTimeout(timer);
        this.off("result", onResult);
        resolve({ id, result });
      };
      const timer = setTimeout(() => {
        this.off("result", onResult);
        resolve({ id, result: null });
      }, this.bodies.size > 0 ? timeoutMs : 0);

      this.on("result", onResult);
      this.emit("command", { id, ...command });
    });
  }

  // Faz o corpo falar (balão + voz), se houver um conectado. O texto é limpo e cortado no limite do contrato.
  speak(text: string): void {
    const speakable = speakableText(text).slice(0, 500);
    if (speakable && this.bodies.size > 0) void this.send({ action: "speak", text: speakable });
  }

  // Mensagem recebida de um cliente WebSocket; `client` identifica a conexão. Devolve true se era do Unity.
  handleMessage(client: unknown, raw: string): boolean {
    let message: { type?: string; payload?: any };
    try {
      message = JSON.parse(raw);
    } catch {
      return false;
    }

    if (message?.type === "unity_hello") {
      this.bodies.add(client);
      this.world = {
        actions: Array.isArray(message.payload?.actions) ? message.payload.actions.map(String) : [],
        objects: Array.isArray(message.payload?.objects)
          ? message.payload.objects.map((item: any) => ({
              id: String(item?.id ?? ""),
              displayName: String(item?.displayName ?? ""),
              interactive: Boolean(item?.interactive)
            }))
          : [],
        holding: message.payload?.holding ? String(message.payload.holding) : null
      };
      this.emit("hello", this.world);
      return true;
    }

    if (message?.type === "unity_result" && this.bodies.has(client)) {
      this.emit("result", {
        id: String(message.payload?.id ?? ""),
        action: String(message.payload?.action ?? ""),
        ok: Boolean(message.payload?.ok),
        error: String(message.payload?.error ?? "")
      } satisfies UnityCommandResult);
      return true;
    }

    return false;
  }

  handleDisconnect(client: unknown) {
    if (this.bodies.delete(client)) this.emit("bye");
  }
}
