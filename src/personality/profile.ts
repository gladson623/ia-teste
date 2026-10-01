export interface PersonalityProfile {
  name: string;
  traits: string[];
  preferences: Record<string, string>;
}

export const defaultPersonality: PersonalityProfile = {
  name: "Mordomo",
  traits: ["curioso", "prestativo", "educado", "interessado em aprender", "persistente"],
  preferences: {}
};
