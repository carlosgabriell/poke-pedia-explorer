import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

describe("team-management translations", () => {
  it("provides English labels for backup, search, and share actions", () => {
    const labels = [
      "Exportar backup",
      "Importar backup",
      "Compartilhar imagem",
      "Buscar Pokémon por nome ou número",
      "A equipe atingiu o limite de seis Pokémon.",
    ];

    labels.forEach((label) => {
      expect(translate("en", label, label)).not.toBe(label);
    });

  });

  it("provides English labels for the AI assistant", () => {
    const labels = [
      "Assistente Pokémon",
      "Assistente Poképedia",
      "Limpar conversa",
      "Sua pergunta",
      "Perguntar",
      "Sua pergunta e os dados Pokémon enviados são processados pela OpenAI. As respostas são geradas por IA e podem conter erros; a chave de acesso fica no servidor. Não envie dados pessoais.",
    ];

    labels.forEach((label) => {
      expect(translate("en", label, label)).not.toBe(label);
    });
  });
});
