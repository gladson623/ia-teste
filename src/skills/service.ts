import { SkillRepository } from "../memory/repositories";

export class SkillService {
  constructor(private readonly skills: SkillRepository) {}

  touchSkill(skillId: string): void {
    const all = this.skills.list();
    const skill = all.find((item) => item.id === skillId);
    if (!skill) return;
    this.skills.update(skillId, {
      successRate: skill.successRate,
      version: skill.version
    });
  }
}
