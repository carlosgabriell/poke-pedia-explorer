import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  AssistantLocale,
  AssistantMessage,
  AssistantPokemon,
} from "./assistant";
import { translate } from "./i18n";

type AssistantPanelProps = {
  locale: AssistantLocale;
  pokemon: AssistantPokemon[];
  contextLoading: boolean;
};

type ApiAnswer = { answer?: unknown; error?: unknown };

function copy(locale: AssistantLocale, portuguese: string, english: string) {
  return translate(locale, portuguese, english);
}

export function AssistantPanel({ locale, pokemon, contextLoading }: AssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "end",
    });
  }, [messages, loading, error]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading || contextLoading) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          locale,
          history: messages.slice(-8),
          pokemon,
        }),
      });
      let result: ApiAnswer;
      try {
        result = await response.json();
      } catch {
        throw new Error(copy(locale, "Não foi possível obter uma resposta. Tente novamente.", "The assistant could not answer. Please try again."));
      }
      const answer = typeof result.answer === "string" ? result.answer.trim() : "";
      if (!response.ok || !answer) {
        const errorCode = typeof result.error === "string" ? result.error : "";
        if (errorCode === "assistant_not_configured") {
          throw new Error(copy(locale, "A IA ainda não está configurada no servidor.", "The AI assistant is not configured on the server yet."));
        }
        if (errorCode === "assistant_rate_limited") {
          throw new Error(copy(locale, "Muitas perguntas em pouco tempo. Tente novamente daqui a pouco.", "Too many questions in a short time. Please try again shortly."));
        }
        throw new Error(copy(locale, "Não foi possível obter uma resposta. Tente novamente.", "The assistant could not answer. Please try again."));
      }
      setMessages((current) => [
        ...current,
        { role: "user", content: trimmed },
        { role: "assistant", content: answer },
      ]);
      setQuestion("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : copy(locale, "Não foi possível obter uma resposta. Tente novamente.", "The assistant could not answer. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="assistant-panel" aria-labelledby="assistant-title">
      <div className="journey-header assistant-header">
        <div>
          <span className="eyebrow">{copy(locale, "AJUDA COM DADOS DO APP", "APP-GROUNDED HELP")}</span>
          <h3 id="assistant-title">{copy(locale, "Assistente Poképedia", "Poképedia assistant")}</h3>
        </div>
        {messages.length > 0 && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setMessages([]);
              setError("");
            }}
          >
            {copy(locale, "Limpar conversa", "Clear conversation")}
          </button>
        )}
      </div>
      <p className="assistant-description">
        {copy(
          locale,
          "Pergunte sobre Pokémon e sua equipe. As respostas usam os dados estruturados disponíveis no perfil e na equipe carregada; informações ausentes serão sinalizadas.",
          "Ask about Pokémon and your team. Answers use structured data available in the profile and loaded team; missing information will be called out.",
        )}
      </p>
      {contextLoading ? (
        <p className="assistant-context" role="status">
          {copy(locale, "Carregando os dados da equipe para dar contexto...", "Loading team data to provide context...")}
        </p>
      ) : pokemon.length > 0 ? (
        <p className="assistant-context" role="status">
          {copy(locale, "Contexto enviado:", "Context sent:")}{" "}
          {pokemon.map((item) => item.name.replace(/-/g, " ")).join(", ")}
        </p>
      ) : (
        <p className="assistant-context">
          {copy(locale, "Abra uma ficha ou monte uma equipe para dar contexto à IA.", "Open a profile or build a team to give the assistant context.")}
        </p>
      )}

      <div className="assistant-conversation" aria-label={copy(locale, "Conversa com o assistente", "Assistant conversation")} aria-live="polite">
        {messages.length === 0 ? (
          <p className="assistant-empty">
            {copy(locale, "Experimente perguntar: “Quais são os pontos fortes desta equipe?”", "Try asking: “What are this team's strengths?”")}
          </p>
        ) : (
          messages.map((message, index) => (
            <article
              className={`assistant-message ${message.role}`}
              key={`${message.role}-${index}`}
            >
              <strong>
                {message.role === "user"
                  ? copy(locale, "Você", "You")
                  : copy(locale, "Assistente", "Assistant")}
              </strong>
              <p>{message.content}</p>
            </article>
          ))
        )}
        {loading && (
          <p className="assistant-loading" role="status">
            {copy(locale, "Analisando os dados...", "Reviewing the data...")}
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <p className="assistant-error" role="alert">{error}</p>}
      <form className="assistant-form" onSubmit={(event) => void ask(event)}>
        <label htmlFor="assistant-question">{copy(locale, "Sua pergunta", "Your question")}</label>
        <textarea
          id="assistant-question"
          value={question}
          maxLength={500}
          rows={3}
          placeholder={copy(locale, "Ex.: Como posso melhorar o equilíbrio dos tipos da minha equipe?", "e.g. How could I improve my team's type balance?")}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={loading}
        />
        <div className="assistant-form-footer">
          <span>{question.length}/500</span>
          <button
            className="primary-button"
            type="submit"
            disabled={loading || contextLoading || question.trim().length === 0}
          >
            {loading || contextLoading
              ? copy(locale, "Aguarde...", "Please wait...")
              : copy(locale, "Perguntar", "Ask")} →
          </button>
        </div>
      </form>
      <p className="assistant-note">
        {copy(
          locale,
          "Sua pergunta e os dados Pokémon enviados são processados pela OpenAI. As respostas são geradas por IA e podem conter erros; a chave de acesso fica no servidor. Não envie dados pessoais.",
          "Your question and submitted Pokémon data are processed by OpenAI. Answers are AI-generated and may be inaccurate; the API key stays on the server. Do not submit personal data.",
        )}
      </p>
    </section>
  );
}
