import { AgentReflection } from "../agent/contracts";
import { Experience, Goal, MemoryEntry } from "../memory/types";

export interface ReflectionResult {
  summary: string;
  memoryCandidates: Array<Pick<MemoryEntry, "type" | "content" | "importance" | "tags" | "metadata" | "source">>;
  goalSuggestions: Array<Pick<Goal, "title" | "description" | "priority" | "source">>;
}

export class ReflectionService {
  // `insight` é a reflexão opcional do LLM; sem ela valem só as regras determinísticas.
  reflect(experience: Experience, insight: AgentReflection = {}): ReflectionResult {
    const learning = insight.learning?.trim();
    const memoryToCreate = insight.memory_to_create?.trim();
    const goalToCreate = insight.goal_to_create?.trim();

    const memoryCandidates: ReflectionResult["memoryCandidates"] = [
      {
        type: "experience",
        content: `${experience.action}: ${experience.result}`,
        importance: experience.success ? 0.5 : 0.8,
        tags: ["experience", experience.success ? "success" : "failure"],
        metadata: {
          observation: experience.observation,
          learning: experience.learning
        },
        source: "reflection"
      }
    ];

    if (memoryToCreate) {
      memoryCandidates.push({
        type: "knowledge",
        content: memoryToCreate,
        importance: 0.6,
        tags: ["reflection"],
        metadata: { experienceId: experience.id, learning: learning ?? "" },
        source: "reflection"
      });
    }

    const goalSuggestions: ReflectionResult["goalSuggestions"] = [];
    if (!experience.success) {
      goalSuggestions.push({
        title: `Melhorar capacidade em: ${experience.action}`,
        description: `Falha observada: ${experience.result}. Elaborar nova estratégia e praticar novamente.`,
        priority: 0.9,
        source: "reflection"
      });
    }

    if (goalToCreate) {
      goalSuggestions.push({
        title: goalToCreate,
        description: learning ?? `Sugerido pela reflexão sobre: ${experience.action}`,
        priority: 0.5,
        source: "reflection"
      });
    }

    const summary =
      learning ??
      (experience.success
        ? "A ação foi concluída com sucesso e gerou aprendizado útil."
        : "A ação falhou; foi sugerido objetivo de melhoria para aumentar autonomia segura.");

    return { summary, memoryCandidates, goalSuggestions };
  }
}
