import { z } from "zod";
import { ReminderRepository } from "../memory/repositories";
import { ToolRegistry } from "./registry";

interface ButlerDeps {
  reminders: ReminderRepository;
}

const reminderSchema = z.object({
  id: z.string(),
  text: z.string(),
  dueAt: z.string(),
  status: z.enum(["pending", "fired", "cancelled"])
});

// Ferramentas de mordomo: data/hora e lembretes. O disparo dos lembretes é feito pelo AgentService.
export function registerButlerTools(registry: ToolRegistry, deps: ButlerDeps): void {
  registry.register({
    name: "get_datetime",
    description: "Obtém a data e a hora atuais",
    capability: "time.read",
    allowLlm: true,
    inputSchema: z.object({}),
    outputSchema: z.object({ iso: z.string(), local: z.string(), weekday: z.string() }),
    execute: async () => {
      const now = new Date();
      return {
        iso: now.toISOString(),
        local: now.toLocaleString("pt-BR"),
        weekday: now.toLocaleDateString("pt-BR", { weekday: "long" })
      };
    }
  });

  registry.register({
    name: "create_reminder",
    description: "Agenda um lembrete para o usuário; informe inMinutes (daqui a quantos minutos) ou dueAt (data e hora ISO)",
    capability: "reminders.write",
    allowLlm: true,
    inputSchema: z.object({
      text: z.string().min(1).describe("O que lembrar"),
      inMinutes: z.number().positive().optional().describe("Daqui a quantos minutos avisar"),
      dueAt: z.string().optional().describe("Data e hora ISO 8601 do aviso")
    }),
    outputSchema: reminderSchema,
    execute: async ({ text, inMinutes, dueAt }) => {
      const due = inMinutes !== undefined ? new Date(Date.now() + inMinutes * 60000) : new Date(dueAt ?? "");
      if (Number.isNaN(due.getTime())) {
        throw new Error("Informe inMinutes ou um dueAt válido em ISO 8601");
      }
      return deps.reminders.create({ text, dueAt: due.toISOString() });
    }
  });

  registry.register({
    name: "list_reminders",
    description: "Lista os lembretes",
    capability: "reminders.read",
    allowLlm: true,
    inputSchema: z.object({ status: z.enum(["pending", "fired", "cancelled"]).optional() }),
    outputSchema: z.object({ reminders: z.array(reminderSchema) }),
    execute: async ({ status }) => ({ reminders: deps.reminders.list(status) })
  });

  registry.register({
    name: "cancel_reminder",
    description: "Cancela um lembrete pendente",
    capability: "reminders.write",
    allowLlm: true,
    inputSchema: z.object({ id: z.string() }),
    outputSchema: z.object({ cancelled: z.boolean() }),
    execute: async ({ id }) => ({ cancelled: deps.reminders.cancel(id) })
  });
}
