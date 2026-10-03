import { z } from "zod";

// Contrato cérebro -> corpo. O Unity só executa as ações listadas aqui; "target" é um ID lógico (ex.: "table"),
// nunca uma posição: quem resolve o ID para um objeto da cena é o Unity.
export const UnityCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move_to"), target: z.string().min(1) }).strict(),
  z.object({ action: z.literal("speak"), text: z.string().min(1).max(500) }).strict(),
  // pick_up: vai até o objeto e o pega. drop: solta o que está na mão em cima de `location` (ou no chão, sem ela).
  z.object({ action: z.literal("pick_up"), target: z.string().min(1) }).strict(),
  z.object({ action: z.literal("drop"), location: z.string().min(1).optional() }).strict()
]);

export type UnityCommand = z.infer<typeof UnityCommandSchema>;
export type MoveToAction = Extract<UnityCommand, { action: "move_to" }>;
export type SpeakAction = Extract<UnityCommand, { action: "speak" }>;
export type PickUpAction = Extract<UnityCommand, { action: "pick_up" }>;
export type DropAction = Extract<UnityCommand, { action: "drop" }>;

export interface UnityCommandResult {
  id: string;
  action: string;
  ok: boolean;
  error: string;
}

// O que o corpo informa ao conectar e sempre que termina uma ação: ações que aceita, objetos da cena e o que está na mão.
export interface UnityWorld {
  actions: string[];
  objects: Array<{ id: string; displayName: string; interactive: boolean }>;
  holding: string | null;
}
