import { DecisionInput, RepairInput } from "./provider";
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

    return this.respond(`${base}${goalPart} Vou seguir com uma resposta segura e determinística.`);
  }

  async decide(input: DecisionInput): Promise<LlmResponse> {
    const activeGoal = input.context.activeGoals[0];
    if (activeGoal) {
      return this.respond(
        JSON.stringify({
          thought_summary: "Priorizar objetivo ativo com ação de consulta de estado.",
          goal: activeGoal.title,
          action: { tool: "get_current_state", arguments: {} },
          reason: "Precisamos avaliar o estado antes de avançar no objetivo."
        })
      );
    }

    return this.respond(
      JSON.stringify({
        thought_summary: "Criar um objetivo inicial para manter progresso contínuo.",
        goal: "Explorar estado atual com segurança",
        action: {
          tool: "create_goal",
          arguments: {
            title: "Explorar estado atual com segurança",
            description: "Coletar observações e registrar aprendizados sem ações perigosas.",
            priority: 0.6,
            source: "agent"
          }
        },
        reason: "Sem objetivos ativos, criar um objetivo de exploração mantém autonomia com segurança."
      })
    );
  }

  async repairDecision(input: RepairInput): Promise<LlmResponse> {
    return this.decide(input);
  }

  async reflect(): Promise<LlmResponse> {
    return this.respond(
      JSON.stringify({
        learning: "Ações com validação de ferramenta reduzem erros operacionais.",
        memory_to_create: "Validar saída estruturada antes de executar tools.",
        goal_to_create: "",
        skill_to_update: ""
      })
    );
  }

  private respond(text: string): LlmResponse {
    return { provider: this.name, text, usedFallback: false };
  }
}
