import { ExperienceRepository } from "../memory/repositories";

export class ExperienceService {
  constructor(private readonly experiences: ExperienceRepository) {}

  recentFailures(limit = 5): number {
    return this.experiences
      .list(limit)
      .filter((experience) => !experience.success)
      .length;
  }
}
