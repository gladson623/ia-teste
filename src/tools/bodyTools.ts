import { z } from "zod";
import { UnityCommand, UnityWorld } from "../unity/actions";
import { UnityBridge } from "../unity/bridge";
import { ToolRegistry } from "./registry";

type WorldObjectInfo = UnityWorld["objects"][number];

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// O modelo às vezes manda o nome ("mesa") em vez do ID ("table"): aceita os dois, desde que não haja ambiguidade.
export function resolveWorldObject(world: UnityWorld | null, reference: string): WorldObjectInfo {
  const objects = world?.objects ?? [];
  const wanted = normalize(reference);
  const exact = objects.filter((item) => normalize(item.id) === wanted || normalize(item.displayName) === wanted);
  const matches = exact.length > 0
    ? exact
    : objects.filter((item) => wanted.length > 2 && (normalize(item.displayName).includes(wanted) || wanted.includes(normalize(item.displayName))));

  if (matches.length !== 1) {
    throw new Error(`Objeto desconhecido: "${reference}". IDs válidos: ${objects.map((item) => item.id).join(", ") || "nenhum"}`);
  }
  return matches[0];
}

// Motivos de recusa devolvidos pelo corpo, em texto que o modelo entende.
function explain(error: string): string {
  const [code, detail] = error.split(":");
  const reasons: Record<string, string> = {
    unknown_target: `o objeto "${detail}" não existe na sala`,
    not_pickable: `"${detail}" não pode ser pego`,
    already_holding: `já há um objeto na mão ("${detail}"); solte-o com drop antes de pegar outro`,
    not_holding: "não há nada na mão para soltar",
    invalid_location: "um objeto não pode ser solto em cima dele mesmo",
    busy: "a fila de ações do corpo está cheia; espere ele terminar"
  };
  return reasons[code] ?? error;
}

// Resumo do corpo e da sala para o prompt do chat: sem isso o modelo não sabe que tem um corpo.
export function describeBody(unity: UnityBridge): string {
  const { connected, world } = unity.getState();
  if (!connected || !world) {
    return "Seu corpo virtual (uma personagem numa sala 3D) está desconectado agora: você não consegue agir no mundo virtual até ele conectar.";
  }

  const objects = world.objects.map((item) => `${item.id} = ${item.displayName || item.id}`).join("; ");
  const pickable = world.objects.filter((item) => item.interactive).map((item) => item.id).join(", ");
  return [
    "Você tem um corpo virtual numa sala 3D e CONSEGUE agir nele com as ferramentas move_to (andar até um objeto), pick_up (pegar) e drop (soltar o que está na mão).",
    "Respostas antigas suas dizendo que não consegue agir no mundo virtual estão desatualizadas: agora você consegue.",
    `Objetos da sala (id = nome): ${objects}. "user" é a pessoa com quem você conversa.`,
    `Podem ser pegos: ${pickable || "nenhum"}. Na mão agora: ${world.holding || "nada"}.`,
    "Quando o usuário pedir para ir, vir, andar, pegar, trazer, levar, colocar ou soltar algo, chame a ferramenta ANTES de responder; não descreva nem simule a ação em texto.",
    "O corpo faz as ações em fila, na ordem pedida. Levar algo a um lugar: pick_up e depois drop com location. Trazer algo ao usuário: pick_up e depois move_to com target \"user\".",
    "Se a ferramenta falhar, explique o motivo ao usuário."
  ].join(" ");
}

// Verbos de pedidos ao corpo ("pega", "traz", "vem até mim"...), sem acentos. Só vale com o corpo conectado.
const ACTION_REQUEST = /\b(peg\w*|tra[gz]\w*|lev[ae]\w*|coloc\w*|coloqu\w*|bot[ae]\w*|po[er]|ponha|solt\w*|larg\w*|guard\w*|venha|vem|va|vai|and[ae]|busc\w*|busqu\w*|entreg\w*)\b/;

export function wantsBodyAction(unity: UnityBridge, message: string): boolean {
  return unity.getState().connected && ACTION_REQUEST.test(normalize(message));
}

const resultSchema = z.object({ ok: z.boolean(), message: z.string() });

// Ferramentas do corpo: o modelo só escolhe a ação e o ID; quem sabe posições e executa é o Unity.
export function registerBodyTools(registry: ToolRegistry, unity: UnityBridge): void {
  const connected = () => unity.getState().connected;
  const world = () => unity.getState().world;

  const act = async (command: UnityCommand, done: string) => {
    const { result } = await unity.send(command);
    if (!result) throw new Error("O corpo não respondeu (desconectado).");
    if (!result.ok) throw new Error(`O corpo recusou: ${explain(result.error)}.`);
    return { ok: true, message: done };
  };

  registry.register({
    name: "look_around",
    description: "Vê os objetos da sala virtual e o que está na sua mão",
    capability: "body.read",
    allowLlm: true,
    chatOnly: true,
    available: connected,
    inputSchema: z.object({}),
    outputSchema: z.object({
      objects: z.array(z.object({ id: z.string(), name: z.string(), pickable: z.boolean() })),
      holding: z.string().nullable()
    }),
    execute: async () => ({
      objects: (world()?.objects ?? []).map((item) => ({ id: item.id, name: item.displayName, pickable: item.interactive })),
      holding: world()?.holding || null
    })
  });

  registry.register({
    name: "move_to",
    description: "Anda com o seu corpo virtual até um objeto da sala (ou até o usuário, com target \"user\")",
    capability: "body.act",
    allowLlm: true,
    chatOnly: true,
    available: connected,
    inputSchema: z.object({ target: z.string().min(1).describe("ID do objeto de destino, ex.: table") }),
    outputSchema: resultSchema,
    execute: async ({ target }) => {
      const item = resolveWorldObject(world(), target);
      return act({ action: "move_to", target: item.id }, `Indo até ${item.displayName || item.id}.`);
    }
  });

  registry.register({
    name: "pick_up",
    description: "Vai até um objeto da sala e o pega com a mão; só funciona com objetos que podem ser pegos e com a mão vazia",
    capability: "body.act",
    allowLlm: true,
    chatOnly: true,
    available: connected,
    inputSchema: z.object({ target: z.string().min(1).describe("ID do objeto a pegar, ex.: red_box") }),
    outputSchema: resultSchema,
    execute: async ({ target }) => {
      const item = resolveWorldObject(world(), target);
      return act({ action: "pick_up", target: item.id }, `Indo pegar ${item.displayName || item.id}.`);
    }
  });

  registry.register({
    name: "drop",
    description: "Solta o objeto que está na mão: em cima de outro objeto (location), perto do usuário (location \"user\") ou, sem location, no chão",
    capability: "body.act",
    allowLlm: true,
    chatOnly: true,
    available: connected,
    inputSchema: z.object({ location: z.string().optional().describe("ID do objeto onde colocar, ex.: shelf") }),
    outputSchema: resultSchema,
    execute: async ({ location }) => {
      if (!location?.trim()) {
        return act({ action: "drop" }, "Soltando o objeto no chão.");
      }
      const item = resolveWorldObject(world(), location);
      return act({ action: "drop", location: item.id }, `Levando o objeto até ${item.displayName || item.id}.`);
    }
  });
}
