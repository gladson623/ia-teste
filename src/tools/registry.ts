import { z } from "zod";
import { ToolDefinition } from "./contracts";

// Descrição compacta dos argumentos, derivada do schema zod, para o prompt do LLM.
function describeSchema(schema: z.ZodTypeAny): string {
  const def = schema._def;

  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const fields = Object.entries((schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>).map(
        ([key, field]) => `${key}${field.isOptional() ? "?" : ""}: ${describeSchema(field)}`
      );
      return fields.length > 0 ? `{ ${fields.join(", ")} }` : "{}";
    }
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return describeSchema(def.innerType);
    case z.ZodFirstPartyTypeKind.ZodArray:
      return `${describeSchema(def.type)}[]`;
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return (def.values as string[]).map((value) => JSON.stringify(value)).join(" | ");
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const { minValue, maxValue } = schema as z.ZodNumber;
      return minValue !== null && maxValue !== null ? `number(${minValue}..${maxValue})` : "number";
    }
    case z.ZodFirstPartyTypeKind.ZodString:
      return "string";
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return "boolean";
    default:
      return "object";
  }
}

// JSON Schema dos argumentos, derivado do mesmo schema zod, para o tool calling nativo do modelo.
function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const converted = convertSchema(schema);
  return schema.description ? { ...converted, description: schema.description } : converted;
}

function convertSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def;

  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
      return {
        type: "object",
        properties: Object.fromEntries(Object.entries(shape).map(([key, field]) => [key, toJsonSchema(field)])),
        required: Object.entries(shape).filter(([, field]) => !field.isOptional()).map(([key]) => key)
      };
    }
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return toJsonSchema(def.innerType);
    case z.ZodFirstPartyTypeKind.ZodArray:
      return { type: "array", items: toJsonSchema(def.type) };
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return { type: "string", enum: def.values as string[] };
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const { minValue, maxValue } = schema as z.ZodNumber;
      return {
        type: "number",
        ...(minValue !== null ? { minimum: minValue } : {}),
        ...(maxValue !== null ? { maximum: maxValue } : {})
      };
    }
    case z.ZodFirstPartyTypeKind.ZodString:
      return { type: "string" };
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return { type: "boolean" };
    default:
      return { type: "object" };
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    this.tools.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }

  get(name: string): ToolDefinition<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  list() {
    // Ferramentas indisponíveis no momento não são oferecidas ao modelo.
    return Array.from(this.tools.values()).filter((tool) => tool.available?.() ?? true).map((tool) => ({
      name: tool.name,
      description: tool.description,
      capability: tool.capability,
      allowLlm: tool.allowLlm,
      chatOnly: tool.chatOnly ?? false,
      arguments: describeSchema(tool.inputSchema),
      parameters: toJsonSchema(tool.inputSchema)
    }));
  }

  async execute<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Ferramenta não encontrada: ${name}`);
    }
    if (tool.available && !tool.available()) {
      throw new Error(`Ferramenta indisponível agora: ${name}`);
    }

    const parsedInput = tool.inputSchema.parse(input);
    const result = await tool.execute(parsedInput);
    return tool.outputSchema.parse(result) as TOutput;
  }
}
