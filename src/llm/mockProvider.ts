import { LlmContext, LlmProvider, LlmResponse } from "./types";

export class MockLlmProvider implements LlmProvider {
  name = "mock";

  async available(): Promise<boolean> {
    return true;
  }

  async generate(context: LlmContext): Promise<LlmResponse> {
    const activeGoal = context.goals.find((goal) => goal.status !== "completed");
    const base = context.userMessage
      ? `Recebi sua mensagem: \"${context.userMessage}\".`
      : "Executando raciocínio local em modo mock.";

    const goalPart = activeGoal
      ? ` Objetivo ativo: ${activeGoal.title}.`
      : " No momento não há objetivo ativo relevante.";

    return {
      provider: this.name,
      text: `${base}${goalPart} Vou seguir com uma resposta segura e determinística.`,
      usedFallback: false
    };
  }
}
