import { Experience, Goal, MemoryEntry } from "../memory/types";

export interface ReflectionResult {
  summary: string;
  memoryCandidates: Array<Pick<MemoryEntry, "type" | "content" | "importance" | "tags" | "metadata" | "source">>;
  goalSuggestions: Array<Pick<Goal, "title" | "description" | "priority" | "source">>;
}

export class ReflectionService {
  reflect(experience: Experience): ReflectionResult {
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

    const goalSuggestions: ReflectionResult["goalSuggestions"] = [];
    if (!experience.success) {
      goalSuggestions.push({
        title: `Melhorar capacidade em: ${experience.action}`,
        description: `Falha observada: ${experience.result}. Elaborar nova estratégia e praticar novamente.`,
        priority: 0.9,
        source: "reflection"
      });
    }

    const summary = experience.success
      ? "A ação foi concluída com sucesso e gerou aprendizado útil."
      : "A ação falhou; foi sugerido objetivo de melhoria para aumentar autonomia segura.";

    return { summary, memoryCandidates, goalSuggestions };
  }
}
