// Os tipos de domínio vivem em memory/types; este módulo só mantém os nomes antigos.
import type { AgentState } from "../memory/types";

export type { AgentState, Experience, Goal, MemoryEntry as Memory, Skill } from "../memory/types";
export type AgentMode = AgentState["mode"];
