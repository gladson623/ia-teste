import { LlmProvider } from './provider.js';

const asJson = (value: unknown) => JSON.stringify(value);

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  async decide(input: any): Promise<string> {
    const activeGoal = input?.context?.activeGoals?.[0];
    if (activeGoal) {
      return asJson({
        thought_summary: 'Priorizar objetivo ativo com ação de consulta de estado.',
        goal: activeGoal.title,
        action: { tool: 'get_current_state', arguments: {} },
        reason: 'Precisamos avaliar o estado antes de avançar no objetivo.'
      });
    }

    return asJson({
      thought_summary: 'Criar um objetivo inicial para manter progresso contínuo.',
      goal: 'Iniciar aprendizado incremental',
      action: { tool: 'create_goal', arguments: { title: 'Aprender com experiências recentes', priority: 5 } },
      reason: 'Sem objetivos ativos, criar um objetivo de aprendizado mantém autonomia com segurança.'
    });
  }

  async repairDecision(input: any): Promise<string> {
    const invalid = String(input?.invalidOutput ?? '');
    if (invalid.includes('invalid_tool')) {
      return asJson({
        thought_summary: 'Corrigindo ferramenta para operação permitida.',
        goal: 'Corrigir execução',
        action: { tool: 'get_current_state', arguments: {} },
        reason: 'Substituição por ferramenta válida e permitida.'
      });
    }

    return this.decide({ context: input?.context });
  }

  async reflect(): Promise<string> {
    return asJson({
      learning: 'Ações com validação de ferramenta reduzem erros operacionais.',
      memory_to_create: 'Validar saída estruturada antes de executar tools.',
      goal_to_create: '',
      skill_to_update: ''
    });
  }
}
