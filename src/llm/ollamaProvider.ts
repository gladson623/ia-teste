import { env } from '../config/env.js';
import { LlmProvider } from './provider.js';

const postGenerate = async (prompt: string) => {
  const response = await fetch(`${env.ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.ollamaModel, prompt, stream: false, format: 'json' })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const body = await response.json() as { response?: string };
  if (!body.response) {
    throw new Error('Ollama empty response');
  }

  return body.response;
};

export class OllamaLlmProvider implements LlmProvider {
  readonly name = 'ollama';

  async decide(input: unknown): Promise<string> {
    return postGenerate(`Você é um planejador de agente. Retorne JSON estrito para decisão.
Contexto: ${JSON.stringify(input)}`);
  }

  async repairDecision(input: { context: unknown; invalidOutput: string; error: string }): Promise<string> {
    return postGenerate(`Corrija para JSON válido no contrato de decisão. Erro: ${input.error}. Saída inválida: ${input.invalidOutput}. Contexto: ${JSON.stringify(input.context)}`);
  }

  async reflect(input: unknown): Promise<string> {
    return postGenerate(`Faça reflexão estruturada opcional em JSON estrito com campos learning,memory_to_create,goal_to_create,skill_to_update. Contexto: ${JSON.stringify(input)}`);
  }
}
