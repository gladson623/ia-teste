import { ToolDefinition } from "./contracts";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    this.tools.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      capability: tool.capability,
      inputSchema: "zod",
      outputSchema: "zod"
    }));
  }

  async execute<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Ferramenta não encontrada: ${name}`);
    }

    const parsedInput = tool.inputSchema.parse(input);
    const result = await tool.execute(parsedInput);
    return tool.outputSchema.parse(result) as TOutput;
  }
}
