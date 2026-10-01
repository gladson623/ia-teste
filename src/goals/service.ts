import { GoalRepository } from "../memory/repositories";

export class GoalService {
  constructor(private readonly goals: GoalRepository) {}

  ensureBaselineGoal(): void {
    const active = this.goals.getActive();
    if (active.length === 0) {
      this.goals.create({
        title: "Aprender com o ambiente atual",
        description: "Coletar sinais do estado atual e registrar aprendizados.",
        priority: 0.4,
        source: "system"
      });
    }
  }
}
