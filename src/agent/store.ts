import {
  AgentStateStore,
  ExperienceRepository,
  GoalRepository,
  MemoryRepository,
  SkillRepository
} from "../memory/repositories";

// Dados do agente: repositórios SQLite + estado em memória. Não há armazenamento próprio aqui.
export interface AgentStore {
  memory: MemoryRepository;
  goals: GoalRepository;
  experiences: ExperienceRepository;
  skills: SkillRepository;
  stateStore: AgentStateStore;
}
