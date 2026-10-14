import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import {
  getArtwork,
  getPokemon,
  getPokemonList,
  getPokemonNamesByType,
  getAbilityList,
  getPokemonNamesByAbility,
  getPortugueseStat,
  getPortugueseType,
  getSpecies,
  getEvolutionChain,
  formatPokemonName,
  generationNumber,
} from "./api";

import type {
  PokemonDetail,
  PokemonSummary,
  SpeciesDetail,
  EvolutionNode,
} from "./types";
import { translate, translateError } from "./i18n";
import { POKEMON_TYPES, getTypeEffectiveness } from "./typeEffectiveness";
import {
  analyzeTeam,
  MAX_TEAM_SIZE,
  normalizeTeamNames,
} from "./teamAnalysis";
import { createQuizQuestion, isCorrectAnswer } from "./quiz";
import type { QuizQuestion } from "./quiz";
import { createTeamBackup, parseTeamBackup } from "./teamBackup";
import { createTeamShareImage } from "./teamShareImage";
import { filterTeamCandidates } from "./teamSelection";
import { AssistantPanel } from "./AssistantPanel";
import type { AssistantPokemon } from "./assistant";

type Tab = "dex" | "journey" | "favorites" | "calculator" | "team" | "quiz" | "assistant";
type LocalePreference = "device" | "pt-BR" | "en";
type ThemePreference = "device" | "light" | "dark";
type JourneyMetrics = {
  types: string[];
  generations: number[];
  comparisons: number;
  evolutionChains: string[];
};
type QuizProgress = {
  roundsPlayed: number;
  correctAnswers: number;
  bestStreak: number;
  perfectRounds: number;
};

const FEATURED_POKEMON = [
  { id: 25, name: "Pikachu" },
  { id: 6, name: "Charizard" },
  { id: 150, name: "Mewtwo" },
  { id: 133, name: "Eevee" },
  { id: 94, name: "Gengar" },
  { id: 149, name: "Dragonite" },
  { id: 448, name: "Lucario" },
];

const COMMON_ABILITIES = [
  "adaptability", "blaze", "chlorophyll", "clear-body", "compound-eyes",
  "cute-charm", "download", "drought", "drizzle", "flash-fire", "levitate",
  "intimidate", "lightning-rod", "overgrow", "pressure", "protean", "torrent",
  "static", "synchronize", "swift-swim", "thick-fat", "water-absorb",
];
const ENGLISH_STATS: Record<string, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  "special-attack": "Sp. Atk",
  "special-defense": "Sp. Def",
  speed: "Speed",
};
const TYPE_LABELS: Record<string, string> = {
  normal: "Normal", fire: "Fire", water: "Water", electric: "Electric",
  grass: "Grass", ice: "Ice", fighting: "Fighting", poison: "Poison",
  ground: "Ground", flying: "Flying", psychic: "Psychic", bug: "Bug",
  rock: "Rock", ghost: "Ghost", dragon: "Dragon", dark: "Dark",
  steel: "Steel", fairy: "Fairy",
};

function readJourneyMetrics(): JourneyMetrics {
  try {
    const value = JSON.parse(localStorage.getItem("poke-explorer-metrics") ?? "{}") as Partial<JourneyMetrics>;
    return {
      types: Array.isArray(value.types) ? value.types.filter((item): item is string => typeof item === "string") : [],
      generations: Array.isArray(value.generations) ? value.generations.filter((item): item is number => typeof item === "number") : [],
      comparisons: typeof value.comparisons === "number" ? value.comparisons : 0,
      evolutionChains: Array.isArray(value.evolutionChains) ? value.evolutionChains.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return { types: [], generations: [], comparisons: 0, evolutionChains: [] };
  }
}

function readQuizProgress(): QuizProgress {
  const empty: QuizProgress = {
    roundsPlayed: 0,
    correctAnswers: 0,
    bestStreak: 0,
    perfectRounds: 0,
  };
  try {
    const value = JSON.parse(
      localStorage.getItem("poke-explorer-quiz-progress") ?? "{}",
    ) as Partial<QuizProgress>;
    const count = (item: unknown) =>
      typeof item === "number" && Number.isFinite(item) && item >= 0
        ? Math.floor(item)
        : 0;
    return {
      roundsPlayed: count(value.roundsPlayed),
      correctAnswers: count(value.correctAnswers),
      bestStreak: count(value.bestStreak),
      perfectRounds: count(value.perfectRounds),
    };
  } catch {
    return empty;
  }
}

function longestCorrectStreak(answers: boolean[]): number {
  let best = 0;
  let current = 0;
  answers.forEach((correct) => {
    current = correct ? current + 1 : 0;
    best = Math.max(best, current);
  });
  return best;
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function evolutionCondition(
  details: EvolutionNode["evolution_details"],
  locale: "pt-BR" | "en",
): string {
  if (details.length === 0) return "";
  return details.map((detail) => {
    const conditions: string[] = [];
    if (detail.min_level) conditions.push(`${copy(locale, "nível", "level")} ${detail.min_level}+`);
    if (detail.trigger?.name === "use-item" && detail.item) {
      conditions.push(`${copy(locale, "usar", "use")} ${formatPokemonName(detail.item.name)}`);
    } else if (detail.item) {
      conditions.push(formatPokemonName(detail.item.name));
    }
    if (detail.held_item) conditions.push(`${copy(locale, "segurando", "holding")} ${formatPokemonName(detail.held_item.name)}`);
    if (detail.trigger?.name === "trade") conditions.push(copy(locale, "troca", "trade"));
    if (detail.location) conditions.push(formatPokemonName(detail.location.name));
    if (detail.min_happiness) conditions.push(`${copy(locale, "amizade", "friendship")} ${detail.min_happiness}+`);
    if (detail.min_affection) conditions.push(`${copy(locale, "carinho", "affection")} ${detail.min_affection}+`);
    if (detail.time_of_day) conditions.push(detail.time_of_day);
    if (detail.known_move) conditions.push(`${copy(locale, "golpe", "move")} ${formatPokemonName(detail.known_move.name)}`);
    if (detail.known_move_type) conditions.push(`${copy(locale, "golpe do tipo", "move type")} ${formatPokemonName(detail.known_move_type.name)}`);
    if (detail.gender === 1) conditions.push(copy(locale, "fêmea", "female"));
    if (detail.gender === 2) conditions.push(copy(locale, "macho", "male"));
    if (detail.trade_species) conditions.push(`${copy(locale, "troca por", "trade for")} ${formatPokemonName(detail.trade_species.name)}`);
    if (conditions.length === 0 && detail.trigger) {
      conditions.push(formatPokemonName(detail.trigger.name));
    }
    return conditions.join(" · ");
  }).filter(Boolean).join(` ${copy(locale, "ou", "or")} `);
}

function readPreference<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

const copy = translate;

const GENERATIONS = [
  { value: "all", label: "Todas as gerações" },

  { value: "1", label: "Geração I · Kanto" },

  { value: "2", label: "Geração II · Johto" },

  { value: "3", label: "Geração III · Hoenn" },

  { value: "4", label: "Geração IV · Sinnoh" },

  { value: "5", label: "Geração V · Unova" },

  { value: "6", label: "Geração VI · Kalos" },

  { value: "7", label: "Geração VII · Alola" },

  { value: "8", label: "Geração VIII · Galar" },

  { value: "9", label: "Geração IX · Paldea" },
];

const TYPE_COLORS: Record<string, string> = {
  normal: "#a8a77a",

  fire: "#ee8130",

  water: "#6390f0",

  electric: "#f7d02c",

  grass: "#7ac74c",

  ice: "#96d9d6",

  fighting: "#c22e28",

  poison: "#a33ea1",

  ground: "#e2bf65",

  flying: "#a98ff3",

  psychic: "#f95587",

  bug: "#a6b91a",

  rock: "#b6a136",

  ghost: "#735797",

  dragon: "#6f35fc",

  dark: "#705746",

  steel: "#b7b7ce",

  fairy: "#d685ad",
};

function readStored(key: string): string[] {
  try {
    const value = localStorage.getItem(key);

    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
}

function readTeamNames(): string[] {
  try {
    return normalizeTeamNames(
      JSON.parse(localStorage.getItem("poke-explorer-team") ?? "[]"),
    );
  } catch {
    return [];
  }
}

function EvolutionBranch({
  node,
  locale,
  onOpen,
}: {
  node: EvolutionNode;
  locale: "pt-BR" | "en";
  onOpen: (name: string) => void;
}) {
  return (
    <div className="evolution-node">
      <button
        className="evolution-chip"
        onClick={() => onOpen(node.species.name)}
      >
        {formatPokemonName(node.species.name)}
      </button>

      {node.evolves_to.length > 0 && (
        <div className="evolution-children">
          {node.evolves_to.map((child) => {
            const condition = evolutionCondition(child.evolution_details, locale);
            return (
              <div className="evolution-edge" key={child.species.name}>
                {condition && <span className="evolution-condition">{condition}</span>}
                <EvolutionBranch node={child} locale={locale} onOpen={onOpen} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("dex");

  const [search, setSearch] = useState("");

  const [generation, setGeneration] = useState("all");

  const [typeFilter, setTypeFilter] = useState("all");
  const [secondaryTypeFilter, setSecondaryTypeFilter] = useState("all");
  const [abilityFilter, setAbilityFilter] = useState("all");
  const [abilityPokemonNames, setAbilityPokemonNames] = useState<string[]>([]);
  const [abilityLoading, setAbilityLoading] = useState(false);
  const [abilityOptions, setAbilityOptions] = useState<string[]>(COMMON_ABILITIES);
  const [visibleCount, setVisibleCount] = useState(32);
  const [sortOrder, setSortOrder] = useState<"number" | "name">("number");
  const [compareNames, setCompareNames] = useState<string[]>([]);
  const [compareDetails, setCompareDetails] = useState<PokemonDetail[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [teamNames, setTeamNames] = useState<string[]>(readTeamNames);
  const [teamCatalog, setTeamCatalog] = useState<PokemonSummary[]>([]);
  const [teamCandidate, setTeamCandidate] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamDetails, setTeamDetails] = useState<PokemonDetail[]>([]);
  const [teamCatalogLoading, setTeamCatalogLoading] = useState(false);
  const [teamDetailsLoading, setTeamDetailsLoading] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
  const [teamSharing, setTeamSharing] = useState(false);
  const [teamImporting, setTeamImporting] = useState(false);
  const teamImportRef = useRef<HTMLInputElement>(null);
  const [quizProgress, setQuizProgress] = useState<QuizProgress>(readQuizProgress);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizQuestionIndex, setQuizQuestionIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<boolean[]>([]);
  const [quizSelectedAnswer, setQuizSelectedAnswer] = useState<string | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  const [quizSessionRecorded, setQuizSessionRecorded] = useState(false);
  const [attackingType, setAttackingType] = useState("fire");
  const [defendingType1, setDefendingType1] = useState("grass");
  const [defendingType2, setDefendingType2] = useState("none");
  const [dailyDetail, setDailyDetail] = useState<PokemonDetail | null>(null);
  const [dailySpecies, setDailySpecies] = useState<SpeciesDetail | null>(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readPreference("poke-explorer-theme", "device"),
  );
  const [localePreference, setLocalePreference] = useState<LocalePreference>(
    () => readPreference("poke-explorer-locale", "device"),
  );
  const [deviceDark, setDeviceDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  const [deviceLocale, setDeviceLocale] = useState<"pt-BR" | "en">(() =>
    navigator.language.toLowerCase().startsWith("pt") ? "pt-BR" : "en",
  );

  const locale = localePreference === "device" ? deviceLocale : localePreference;
  const theme = themePreference === "device"
    ? (deviceDark ? "dark" : "light")
    : themePreference;

  const [list, setList] = useState<PokemonSummary[]>([]);

  const [details, setDetails] = useState<PokemonDetail[]>([]);

  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [typePokemonNames, setTypePokemonNames] = useState<string[]>([]);

  const [typeLoading, setTypeLoading] = useState(false);

  const [error, setError] = useState("");

  const [selected, setSelected] = useState<PokemonDetail | null>(null);

  const [species, setSpecies] = useState<SpeciesDetail | null>(null);

  const [evolution, setEvolution] = useState<EvolutionNode | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);

  const [favorites, setFavorites] = useState<string[]>(() =>
    readStored("poke-explorer-favorites"),
  );

  const [discovered, setDiscovered] = useState<string[]>(() =>
    readStored("poke-explorer-discovered"),
  );
  const [journeyMetrics, setJourneyMetrics] = useState<JourneyMetrics>(readJourneyMetrics);

  const todayKey = localDateKey();
  const dayNumber = Number(todayKey.replace(/-/g, ""));
  const pokemonOfTheDay = FEATURED_POKEMON[dayNumber % FEATURED_POKEMON.length];
  const effectiveness = getTypeEffectiveness(
    attackingType,
    [defendingType1, defendingType2].filter((type) => type !== "none"),
  );
  const teamMembers = useMemo(
    () =>
      teamNames.flatMap((name) => {
        const pokemon = teamDetails.find((item) => item.name === name);
        return pokemon ? [pokemon] : [];
      }),
    [teamNames, teamDetails],
  );
  const assistantPokemon = useMemo<AssistantPokemon[]>(() => {
    const unique = new Map<string, PokemonDetail>();
    [...teamMembers, ...(selected ? [selected] : [])].forEach((pokemon) => {
      if (!unique.has(pokemon.name)) unique.set(pokemon.name, pokemon);
    });
    return [...unique.values()].slice(0, 6).map((pokemon) => ({
      name: pokemon.name,
      number: pokemon.id,
      types: pokemon.types.map((item) => item.type.name),
      abilities: pokemon.abilities.map((item) => item.ability.name),
      stats: pokemon.stats.map((item) => ({
        name: item.stat.name,
        value: item.base_stat,
      })),
      heightMeters: pokemon.height / 10,
      weightKg: pokemon.weight / 10,
    }));
  }, [teamMembers, selected]);
  const teamAnalysis = useMemo(() => analyzeTeam(teamMembers), [teamMembers]);
  const filteredTeamCatalog = useMemo(() => {
    return filterTeamCandidates(teamCatalog, teamNames, teamSearch);
  }, [teamCatalog, teamNames, teamSearch]);
  const totalBaseStats = selected?.stats.reduce((total, stat) => total + stat.base_stat, 0) ?? 0;
  const totalEffortYield = selected?.stats.reduce((total, stat) => total + (stat.effort ?? 0), 0) ?? 0;

  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  const [online, setOnline] = useState(navigator.onLine);
  const activeDialogKey = comparisonOpen
    ? "comparison"
    : selected
      ? `pokemon-${selected.id}`
      : detailLoading
        ? "loading"
        : "";

  useEffect(() => {
    const handleOnline = () => setOnline(true);

    const handleOffline = () => setOnline(false);

    const handleInstall = (event: Event) => {
      event.preventDefault();

      setInstallPrompt(event);
    };

    window.addEventListener("online", handleOnline);

    window.addEventListener("offline", handleOffline);

    window.addEventListener("beforeinstallprompt", handleInstall);

    return () => {
      window.removeEventListener("online", handleOnline);

      window.removeEventListener("offline", handleOffline);

      window.removeEventListener("beforeinstallprompt", handleInstall);
    };
  }, []);

  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateDevicePreferences = () => {
      setDeviceDark(colorScheme.matches);
      setDeviceLocale(
        navigator.language.toLowerCase().startsWith("pt") ? "pt-BR" : "en",
      );
    };
    colorScheme.addEventListener("change", updateDevicePreferences);
    window.addEventListener("languagechange", updateDevicePreferences);
    return () => {
      colorScheme.removeEventListener("change", updateDevicePreferences);
      window.removeEventListener("languagechange", updateDevicePreferences);
    };
  }, []);

  useEffect(() => {
    if (!activeDialogKey) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-modal="true"]',
    );
    if (!dialog) return;

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusInitial = window.requestAnimationFrame(() => {
      const focusables = dialog.querySelectorAll<HTMLElement>(focusableSelector);
      (focusables[0] ?? dialog).focus();
    });
    const handleDialogKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setComparisonOpen(false);
        setSelected(null);
        setDetailLoading(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeydown);
    return () => {
      window.cancelAnimationFrame(focusInitial);
      document.removeEventListener("keydown", handleDialogKeydown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [activeDialogKey]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("poke-explorer-theme", themePreference);
  }, [theme, themePreference]);

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem("poke-explorer-locale", localePreference);
  }, [locale, localePreference]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setFeaturedIndex((index) => (index + 1) % FEATURED_POKEMON.length),
      6000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("poke-explorer-favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(
      "poke-explorer-discovered",

      JSON.stringify(discovered),
    );
  }, [discovered]);

  useEffect(() => {
    localStorage.setItem("poke-explorer-metrics", JSON.stringify(journeyMetrics));
  }, [journeyMetrics]);

  useEffect(() => {
    localStorage.setItem("poke-explorer-team", JSON.stringify(teamNames));
  }, [teamNames]);

  useEffect(() => {
    localStorage.setItem(
      "poke-explorer-quiz-progress",
      JSON.stringify(quizProgress),
    );
  }, [quizProgress]);

  useEffect(() => {
    if (tab !== "team") return;

    let active = true;
    setTeamCatalogLoading(true);
    void getPokemonList(1025)
      .then((pokemon) => {
        if (!active) return;
        setTeamCatalog(pokemon);
        setTeamCandidate((current) => current || pokemon[0]?.name || "");
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Não foi possível carregar a Pokédex.");
        }
      })
      .finally(() => {
        if (active) setTeamCatalogLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tab, reloadKey]);

  useEffect(() => {
    if (tab !== "team" && tab !== "assistant") return;
    if (teamNames.length === 0) {
      setTeamDetails([]);
      setTeamDetailsLoading(false);
      return;
    }

    let active = true;
    setTeamDetailsLoading(true);
    void Promise.allSettled(teamNames.map(getPokemon))
      .then((results) => {
        if (!active) return;
        const loaded = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") {
          setError(failure.reason instanceof Error
            ? failure.reason.message
            : "Não foi possível carregar os detalhes da equipe.");
        }
        setTeamDetails(loaded);
      })
      .finally(() => {
        if (active) setTeamDetailsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tab, teamNames, reloadKey]);

  useEffect(() => {
    let active = true;
    async function loadDailyPokemon() {
      try {
        const pokemon = await getPokemon(pokemonOfTheDay.id);
        const speciesData = await getSpecies(pokemon.species.url);
        if (active) {
          setDailyDetail(pokemon);
          setDailySpecies(speciesData);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Não foi possível carregar o Pokémon do dia.");
        }
      }
    }
    setDailyDetail(null);
    setDailySpecies(null);
    void loadDailyPokemon();
    return () => {
      active = false;
    };
  }, [pokemonOfTheDay.id, reloadKey]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      setError("");

      try {
        const offsetLimit: Record<string, { offset: number; limit: number }> = {
          "1": { offset: 0, limit: 151 },

          "2": { offset: 151, limit: 100 },

          "3": { offset: 251, limit: 135 },

          "4": { offset: 386, limit: 107 },

          "5": { offset: 493, limit: 156 },

          "6": { offset: 649, limit: 72 },

          "7": { offset: 721, limit: 88 },

          "8": { offset: 809, limit: 96 },

          "9": { offset: 905, limit: 120 },
        };

        const params =
          generation === "all"
            ? { offset: 0, limit: 1025 }
            : offsetLimit[generation];

        const results = await getPokemonList(params.limit, params.offset);

        if (!active) return;

        setList(results);
        setLoading(false);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Erro ao carregar os dados.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [generation, reloadKey]);

  useEffect(() => {
    let active = true;
    void getAbilityList()
      .then((abilities) => {
        if (active) setAbilityOptions(abilities.map((item) => item.name));
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Não foi possível carregar as habilidades.");
        }
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;

    async function loadType() {
      const selectedTypes = [typeFilter, secondaryTypeFilter].filter(
        (type) => type !== "all",
      );
      if (selectedTypes.length === 0) {
        setTypePokemonNames([]);
        setTypeLoading(false);
        return;
      }

      setTypeLoading(true);
      try {
        const groupedNames = await Promise.all(selectedTypes.map(getPokemonNamesByType));
        const names = groupedNames.length === 1
          ? groupedNames[0]
          : groupedNames[0].filter((name) => groupedNames[1].includes(name));
        if (active) setTypePokemonNames(names);
      } catch (e) {
        if (active) {
          setTypePokemonNames([]);
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar o filtro de tipo.",
          );
        }
      } finally {
        if (active) setTypeLoading(false);
      }
    }

    void loadType();
    return () => {
      active = false;
    };
  }, [typeFilter, secondaryTypeFilter, reloadKey]);

  useEffect(() => {
    let active = true;
    async function loadAbility() {
      if (abilityFilter === "all") {
        setAbilityPokemonNames([]);
        setAbilityLoading(false);
        return;
      }
      setAbilityLoading(true);
      try {
        const names = await getPokemonNamesByAbility(abilityFilter);
        if (active) setAbilityPokemonNames(names);
      } catch (e) {
        if (active) {
          setAbilityPokemonNames([]);
          setError(e instanceof Error ? e.message : "Não foi possível carregar o filtro de habilidade.");
        }
      } finally {
        if (active) setAbilityLoading(false);
      }
    }
    void loadAbility();
    return () => {
      active = false;
    };
  }, [abilityFilter, reloadKey]);

  const detailMap = useMemo(
    () => new Map(details.map((p) => [p.name, p])),

    [details],
  );

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, "");

    return list.filter((item) => {
      const numberMatch =
        q !== "" &&
        /^\d+$/.test(q) &&
        Number(q) === Number(item.url.match(/\/pokemon\/(\d+)\//)?.[1]);

      const searchMatch = !q || item.name.includes(q) || numberMatch;

      const typeMatch =
        (typeFilter === "all" && secondaryTypeFilter === "all") ||
        typePokemonNames.includes(item.name);
      const abilityMatch =
        abilityFilter === "all" || abilityPokemonNames.includes(item.name);

      const favoriteMatch =
        tab !== "favorites" || favorites.includes(item.name);

      return searchMatch && typeMatch && abilityMatch && favoriteMatch;
    });
  }, [list, search, typeFilter, secondaryTypeFilter, typePokemonNames, abilityFilter, abilityPokemonNames, tab, favorites]);

  const sortedList = useMemo(() => {
    const sorted = [...filteredList];
    if (sortOrder === "name") {
      sorted.sort((left, right) => left.name.localeCompare(right.name));
    }
    return sorted;
  }, [filteredList, sortOrder]);

  const visibleList = useMemo(
    () => sortedList.slice(0, visibleCount),
    [sortedList, visibleCount],
  );

  useEffect(() => {
    setVisibleCount(32);
  }, [search, generation, typeFilter, secondaryTypeFilter, abilityFilter, tab, favorites, sortOrder]);

  useEffect(() => {
    let active = true;
    const missing = visibleList.filter((item) => !detailMap.has(item.name));
    if (missing.length === 0) return;
    void Promise.allSettled(missing.map((item) => getPokemon(item.name))).then((results) => {
      if (!active) return;
      const fetched = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        setError(failure.reason instanceof Error ? failure.reason.message : "Não foi possível carregar alguns detalhes.");
      }
      if (fetched.length) {
        setDetails((previous) => {
          const merged = new Map(previous.map((pokemon) => [pokemon.name, pokemon]));
          fetched.forEach((pokemon) => merged.set(pokemon.name, pokemon));
          return [...merged.values()];
        });
      }
    });
    return () => {
      active = false;
    };
  }, [visibleList, detailMap, reloadKey]);

  function toggleCompare(name: string) {
    setCompareNames((previous) => {
      if (previous.includes(name)) return previous.filter((item) => item !== name);
      if (previous.length >= 3) {
        setError(copy(locale, "Você pode comparar até 3 Pokémon por vez.", "You can compare up to 3 Pokémon at a time."));
        return previous;
      }
      return [...previous, name];
    });
  }

  async function openComparison() {
    if (compareNames.length < 2) return;
    try {
      const pokemon = await Promise.all(compareNames.map(getPokemon));
      setCompareDetails(pokemon);
      setJourneyMetrics((previous) => ({
        ...previous,
        comparisons: previous.comparisons + 1,
      }));
      setComparisonOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível comparar os Pokémon.");
    }
  }

  async function openPokemon(name: string) {
    setDetailLoading(true);

    setSelected(null);

    setSpecies(null);

    setEvolution(null);

    try {
      const pokemon = await getPokemon(name);

      setSelected(pokemon);

      setDiscovered((prev) =>
        prev.includes(pokemon.name) ? prev : [...prev, pokemon.name],
      );

      const speciesData = await getSpecies(pokemon.species.url);

      setSpecies(speciesData);
      setJourneyMetrics((previous) => ({
        ...previous,
        types: [...new Set([...previous.types, ...pokemon.types.map((item) => item.type.name)])],
        generations: [...new Set([...previous.generations, generationNumber(speciesData.generation.name)])].filter((value) => value > 0),
      }));

      const chain = await getEvolutionChain(speciesData.evolution_chain.url);

      setEvolution(chain);
      setJourneyMetrics((previous) => ({
        ...previous,
        evolutionChains: previous.evolutionChains.includes(speciesData.evolution_chain.url)
          ? previous.evolutionChains
          : [...previous.evolutionChains, speciesData.evolution_chain.url],
      }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível abrir este Pokémon.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleFavorite(name: string) {
    setFavorites((prev) =>
      prev.includes(name)
        ? prev.filter((item) => item !== name)
        : [...prev, name],
    );
  }

  function addTeamMember(name = teamCandidate) {
    if (
      !name ||
      teamNames.includes(name)
    ) {
      return;
    }
    if (teamNames.length >= MAX_TEAM_SIZE) {
      setTeamMessage(copy(locale, "A equipe atingiu o limite de seis Pokémon.", "Your team has reached the six-Pokémon limit."));
      return;
    }
    setTeamNames((previous) => [...previous, name]);
    setTeamCandidate("");
    setTeamSearch("");
    setTeamMessage(copy(locale, `${formatPokemonName(name)} foi adicionado à equipe.`, `${formatPokemonName(name)} was added to the team.`));
  }

  function exportTeamBackup() {
    try {
      const content = createTeamBackup(teamNames);
      const url = URL.createObjectURL(
        new Blob([content], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "poke-pedia-equipe.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTeamMessage(copy(locale, "Backup da equipe baixado.", "Team backup downloaded."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar o backup.");
    }
  }

  async function importTeamBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setTeamImporting(true);
    try {
      if (file.size > 64 * 1024) {
        throw new Error("O arquivo de backup excede o limite de 64 KB.");
      }
      const names = parseTeamBackup(await file.text());
      const results = await Promise.allSettled(names.map(getPokemon));
      const failedIndex = results.findIndex((result) => result.status === "rejected");
      if (failedIndex >= 0) {
        throw new Error(
          `${formatPokemonName(names[failedIndex])} ${copy(locale, "não foi encontrado na PokéAPI; a equipe não foi alterada.", "was not found in PokéAPI; the team was not changed.")}`,
        );
      }
      setTeamNames(names);
      setTeamCandidate("");
      setTeamSearch("");
      setTeamMessage(copy(locale, "Backup importado e validado com sucesso.", "Backup imported and validated successfully."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível importar o backup.");
    } finally {
      setTeamImporting(false);
    }
  }

  async function shareTeamImage() {
    if (teamMembers.length !== teamNames.length) {
      setTeamMessage(copy(locale, "Aguarde o carregamento de todos os Pokémon da equipe.", "Wait for all team Pokémon to finish loading."));
      return;
    }

    setTeamSharing(true);
    try {
      const image = await createTeamShareImage(teamMembers, locale);
      const file = new File([image], "poke-pedia-equipe.png", {
        type: "image/png",
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: copy(locale, "Minha equipe Pokémon", "My Pokémon team"),
        });
        setTeamMessage(copy(locale, "Imagem da equipe compartilhada.", "Team image shared."));
      } else {
        const url = URL.createObjectURL(image);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setTeamMessage(copy(locale, "Imagem baixada. Agora você pode enviar para seus amigos.", "Image downloaded. You can now send it to your friends."));
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Não foi possível compartilhar a equipe.");
    } finally {
      setTeamSharing(false);
    }
  }

  async function startQuiz() {
    setQuizLoading(true);
    setQuizQuestions([]);
    setQuizComplete(false);
    setQuizSessionRecorded(false);
    setQuizSelectedAnswer(null);
    setQuizAnswers([]);
    setQuizQuestionIndex(0);
    try {
      const catalog = await getPokemonList(1025);
      if (catalog.length < 5) {
        throw new Error("Não há Pokémon suficientes para iniciar um desafio.");
      }
      const candidates = [...catalog];
      for (let index = candidates.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Math.random() * (index + 1));
        [candidates[index], candidates[other]] = [
          candidates[other],
          candidates[index],
        ];
      }
      const pokemon = await Promise.all(
        candidates.slice(0, 5).map((item) => getPokemon(item.name)),
      );
      setQuizQuestions(
        pokemon.map((item, index) =>
          createQuizQuestion(item, index % 2 === 0 ? "type" : "stat"),
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível preparar o desafio.",
      );
    } finally {
      setQuizLoading(false);
    }
  }

  function answerQuizQuestion(answer: string) {
    const question = quizQuestions[quizQuestionIndex];
    if (!question || quizSelectedAnswer !== null) return;
    setQuizSelectedAnswer(answer);
    setQuizAnswers((previous) => [
      ...previous,
      isCorrectAnswer(question, answer),
    ]);
  }

  function advanceQuiz() {
    if (quizSelectedAnswer === null) return;
    if (quizQuestionIndex + 1 < quizQuestions.length) {
      setQuizQuestionIndex((index) => index + 1);
      setQuizSelectedAnswer(null);
      return;
    }
    setQuizComplete(true);
    if (quizSessionRecorded) return;

    const correctAnswers = quizAnswers.filter(Boolean).length;
    const perfect = correctAnswers === quizQuestions.length;
    setQuizProgress((previous) => ({
      roundsPlayed: previous.roundsPlayed + 1,
      correctAnswers: previous.correctAnswers + correctAnswers,
      bestStreak: Math.max(
        previous.bestStreak,
        longestCorrectStreak(quizAnswers),
      ),
      perfectRounds: previous.perfectRounds + (perfect ? 1 : 0),
    }));
    setQuizSessionRecorded(true);
  }

  async function installApp() {
    const prompt = installPrompt as
      | (Event & { prompt?: () => Promise<void> })
      | null;

    if (prompt?.prompt) {
      await prompt.prompt();

      setInstallPrompt(null);
    } else {
      alert(
        "No Chrome ou Edge, use o ícone de instalação na barra de endereço ou abra o menu do navegador e escolha “Instalar aplicativo”.",
      );
    }
  }

  const discoveredPercent = Number(((discovered.length / 1025) * 100).toFixed(1));

  const selectedFavorite = selected ? favorites.includes(selected.name) : false;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();

            setTab("dex");

            setSelected(null);
          }}
        >
          <span className="brand-mark">
            <span />
          </span>

          <span>
            <strong>Poképedia</strong>

            <small>EXPLORER</small>
          </span>
        </a>

        <div className="topbar-right">
          <label className="preference-select">
            <span className="sr-only">{copy(locale, "Tema", "Theme")}</span>
            <select
              aria-label={copy(locale, "Tema", "Theme")}
              value={themePreference}
              onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
            >
              <option value="device">{copy(locale, "Tema do dispositivo", "Device theme")}</option>
              <option value="light">{copy(locale, "Claro", "Light")}</option>
              <option value="dark">{copy(locale, "Escuro", "Dark")}</option>
            </select>
          </label>
          <label className="preference-select language-select">
            <span className="sr-only">{copy(locale, "Idioma", "Language")}</span>
            <select
              aria-label={copy(locale, "Idioma", "Language")}
              value={localePreference}
              onChange={(event) => setLocalePreference(event.target.value as LocalePreference)}
            >
              <option value="device">{copy(locale, "Idioma do dispositivo", "Device language")}</option>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English</option>
            </select>
          </label>
          <span className={`connection ${online ? "is-online" : "is-offline"}`}>
            <i />

            {online ? copy(locale, "Conectado", "Online") : copy(locale, "Offline", "Offline")}
          </span>

          <button className="install-button" onClick={() => void installApp()}>
            ＋ {copy(locale, "Instalar app", "Install app")}
          </button>
        </div>
      </header>

      <main className="main-content">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
            <span className="eyebrow-dot" /> {copy(locale, "SUA JORNADA COMEÇA AQUI", "YOUR JOURNEY STARTS HERE")}
            </span>

            <h1>
              {copy(locale, "O mundo Pokémon", "The Pokémon world")}
              <br />
              <em>{copy(locale, "está esperando.", "is waiting.")}</em>
            </h1>

            <p>
              {copy(locale, "Redescubra os clássicos, encontre novas espécies e registre cada descoberta da sua jornada.", "Rediscover the classics, find new species, and record every discovery on your journey.")}
            </p>

            <div className="hero-actions">
              <button
                className="primary-button"
                onClick={() => {
                  setTab("dex");

                  setSelected(null);

                  document

                    .getElementById("explorer")

                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {copy(locale, "Explorar Pokédex", "Explore Pokédex")} <span>↗</span>
              </button>

              <div className="hero-stat">
                <strong>{discovered.length}</strong>

                <span>{copy(locale, "descobertos", "discovered")}</span>
              </div>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />

            <div className="orbit orbit-two" />

            <div className="hero-glow" />

            <img
              key={FEATURED_POKEMON[featuredIndex].id}
              src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${FEATURED_POKEMON[featuredIndex].id}.png`}
              alt=""
            />

            <span className="hero-tag">
              #{String(FEATURED_POKEMON[featuredIndex].id).padStart(3, "0")} · {FEATURED_POKEMON[featuredIndex].name.toUpperCase()}
            </span>
          </div>

          <div className="hero-grid" />
        </section>

        <section className="daily-pokemon">
          <div className="daily-art">
            {dailyDetail ? (
              <img src={getArtwork(dailyDetail)} alt={formatPokemonName(dailyDetail.name)} loading="lazy" />
            ) : (
              <div className="daily-skeleton" aria-hidden="true" />
            )}
          </div>
          <div className="daily-copy">
            <span className="eyebrow">{copy(locale, "POKÉMON DO DIA", "POKÉMON OF THE DAY")}</span>
            <h2>{dailyDetail ? formatPokemonName(dailyDetail.name) : pokemonOfTheDay.name}</h2>
            <span className="daily-number">#{String(pokemonOfTheDay.id).padStart(4, "0")}</span>
            {dailyDetail && (
              <div className="type-pills daily-types">
                {dailyDetail.types.map((item) => (
                  <span key={item.type.name} style={{ backgroundColor: TYPE_COLORS[item.type.name] }}>
                    {copy(locale, getPortugueseType(item.type.name), TYPE_LABELS[item.type.name])}
                  </span>
                ))}
              </div>
            )}
            <p>
              {dailySpecies?.flavor_text_entries.find((entry) => entry.language.name === (locale === "pt-BR" ? "pt" : "en"))?.flavor_text.replace(/[\n\f]/g, " ") ??
                copy(locale, "Uma espécie em destaque para explorar hoje. Consulte sua ficha para conhecer os dados disponíveis na PokéAPI.", "A featured species to explore today. Open its profile to view the data available from PokéAPI.")}
            </p>
            <button className="secondary-button" disabled={!dailyDetail} onClick={() => void openPokemon(pokemonOfTheDay.name.toLowerCase())}>
              {copy(locale, "Abrir ficha", "Open profile")} ↗
            </button>
          </div>
          <span className="daily-date">{todayKey}</span>
        </section>

        <section className="progress-strip">
          <div className="progress-icon">✦</div>

          <div className="progress-text">
            <strong>{copy(locale, "Sua coleção está começando", "Your collection is taking shape")}</strong>

            <span>
              {copy(locale, "Abra uma ficha para registrar uma descoberta e acompanhe seu progresso.", "Open a Pokémon profile to record a discovery and track your progress.")}
            </span>
          </div>

          <div className="progress-meter">
            <div className="meter-label">
              <span>{copy(locale, "Pokédex descoberta", "Pokédex discovered")}</span>

              <strong>{discoveredPercent}%</strong>
            </div>

            <div className="meter-track">
              <div style={{ width: `${discoveredPercent}%` }} />
            </div>

            <small>
              {discovered.length} {copy(locale, "de 1.025 espécies cadastradas na PokéAPI", "of 1,025 species in the PokéAPI")}
            </small>
          </div>
        </section>

        <div className="section-heading" id="explorer">
          <div>
            <span className="eyebrow">{copy(locale, "CENTRAL DE PESQUISA", "RESEARCH HUB")}</span>

            <h2>{copy(locale, "Explore o universo", "Explore the universe")}</h2>
          </div>

          <span className="section-note">{copy(locale, "Seu próximo Pokémon está aqui.", "Your next Pokémon is here.")}</span>
        </div>

        <nav className="tabs" aria-label={copy(locale, "Seções", "Sections")}>
          <button
            aria-pressed={tab === "dex"}
            className={tab === "dex" ? "active" : ""}
            onClick={() => setTab("dex")}
          >
            ▦ <span>Pokédex</span>
          </button>

          <button
            aria-pressed={tab === "journey"}
            className={tab === "journey" ? "active" : ""}
            onClick={() => setTab("journey")}
          >
            ⌁ <span>{copy(locale, "Minha jornada", "My journey")}</span>
          </button>

          <button
            aria-pressed={tab === "favorites"}
            className={tab === "favorites" ? "active" : ""}
            onClick={() => setTab("favorites")}
          >
            ♡ <span>{copy(locale, "Favoritos", "Favorites")}</span>
            <span className="tab-count">{favorites.length}</span>
          </button>
          <button
            aria-pressed={tab === "calculator"}
            className={tab === "calculator" ? "active" : ""}
            onClick={() => setTab("calculator")}
          >
            ⚡ <span>{copy(locale, "Calculadora de tipos", "Type calculator")}</span>
          </button>
          <button
            aria-pressed={tab === "team"}
            className={tab === "team" ? "active" : ""}
            onClick={() => setTab("team")}
          >
            ◈ <span>{copy(locale, "Montador de equipes", "Team builder")}</span>
          </button>
          <button
            aria-pressed={tab === "quiz"}
            className={tab === "quiz" ? "active" : ""}
            onClick={() => setTab("quiz")}
          >
            ❖ <span>{copy(locale, "Quiz Pokémon", "Pokémon quiz")}</span>
          </button>
          <button
            aria-pressed={tab === "assistant"}
            className={tab === "assistant" ? "active" : ""}
            onClick={() => setTab("assistant")}
          >
            ✧ <span>{copy(locale, "Assistente Pokémon", "Pokémon assistant")}</span>
          </button>
        </nav>

        {error && (
          <div className="error-banner" role="alert">
            {translateError(locale, error)}{" "}
            <button onClick={() => { setError(""); setReloadKey((value) => value + 1); }}>
              {copy(locale, "Tentar novamente", "Try again")}
            </button>
            <button onClick={() => setError("")}>
              {copy(locale, "Fechar", "Close")}
            </button>
          </div>
        )}

        {tab === "journey" ? (
          <section className="journey-panel">
            <div className="journey-header">
              <div>
                <span className="eyebrow">{copy(locale, "DIÁRIO DO PESQUISADOR", "RESEARCHER'S JOURNAL")}</span>

                <h3>{copy(locale, "Sua jornada até agora", "Your journey so far")}</h3>
              </div>

              <div className="journey-badge">✦ {discovered.length >= 50 ? copy(locale, "Pesquisador lendário", "Legendary researcher") : discovered.length >= 10 ? copy(locale, "Pesquisador experiente", "Experienced researcher") : copy(locale, "Pesquisador iniciante", "Novice researcher")}</div>
            </div>

            <div className="journey-stats journey-stats-expanded">
              <div>
                <span>◉</span>

                <strong>{discovered.length}</strong>

                <small>{copy(locale, "Perfis consultados", "Profiles viewed")}</small>
              </div>

              <div>
                <span>♡</span>

                <strong>{favorites.length}</strong>

                <small>{copy(locale, "Pokémon favoritos", "Favorite Pokémon")}</small>
              </div>

              <div>
                <span>⌁</span>

                <strong>{journeyMetrics.comparisons}</strong>

                <small>{copy(locale, "Comparações realizadas", "Comparisons made")}</small>
              </div>
              <div>
                <span>✦</span>
                <strong>{journeyMetrics.types.length}</strong>
                <small>{copy(locale, "Tipos explorados", "Types explored")}</small>
              </div>
              <div>
                <span>◈</span>
                <strong>{journeyMetrics.generations.length}</strong>
                <small>{copy(locale, "Gerações exploradas", "Generations explored")}</small>
              </div>
              <div>
                <span>↗</span>
                <strong>{journeyMetrics.evolutionChains.length}</strong>
                <small>{copy(locale, "Linhas evolutivas consultadas", "Evolution lines explored")}</small>
              </div>
              <div>
                <span>❖</span>
                <strong>{quizProgress.roundsPlayed}</strong>
                <small>{copy(locale, "Desafios concluídos", "Quiz rounds completed")}</small>
              </div>
            </div>

            <div className="journey-progress">
              <div className="meter-label">
                <span>{copy(locale, "Progresso da Pokédex", "Pokédex progress")}</span>

                <strong>{discoveredPercent}%</strong>
              </div>

              <div className="meter-track">
                <div style={{ width: `${discoveredPercent}%` }} />
              </div>
            </div>

            <h4>{copy(locale, "Conquistas", "Achievements")}</h4>
            <div className="achievement-grid">
              {[
                { title: copy(locale, "Primeira descoberta", "First discovery"), description: copy(locale, "Abriu sua primeira ficha", "Opened your first profile"), unlocked: discovered.length >= 1, icon: "✦" },
                { title: copy(locale, "Colecionador", "Collector"), description: copy(locale, "Consultou 10 perfis", "Viewed 10 profiles"), unlocked: discovered.length >= 10, icon: "◈" },
                { title: copy(locale, "Fã de carteirinha", "Superfan"), description: copy(locale, "Salvou seu primeiro favorito", "Saved your first favorite"), unlocked: favorites.length >= 1, icon: "♥" },
                { title: copy(locale, "Especialista em tipos", "Type specialist"), description: copy(locale, "Explorou 10 tipos diferentes", "Explored 10 different types"), unlocked: journeyMetrics.types.length >= 10, icon: "⚡" },
                { title: copy(locale, "Analista Pokémon", "Pokémon analyst"), description: copy(locale, "Comparou Pokémon pela primeira vez", "Compared Pokémon for the first time"), unlocked: journeyMetrics.comparisons >= 1, icon: "⇄" },
                { title: copy(locale, "Mestre das evoluções", "Evolution expert"), description: copy(locale, "Consultou 5 linhas evolutivas", "Viewed 5 evolution lines"), unlocked: journeyMetrics.evolutionChains.length >= 5, icon: "↗" },
                { title: copy(locale, "Conhecedor de gerações", "Generation explorer"), description: copy(locale, "Explorou 5 gerações", "Explored 5 generations"), unlocked: journeyMetrics.generations.length >= 5, icon: "★" },
                { title: copy(locale, "Primeiro desafio", "First challenge"), description: copy(locale, "Concluiu uma rodada de quiz", "Completed a quiz round"), unlocked: quizProgress.roundsPlayed >= 1, icon: "❖" },
                { title: copy(locale, "Mestre do quiz", "Quiz master"), description: copy(locale, "Acertou 25 perguntas", "Answered 25 questions correctly"), unlocked: quizProgress.correctAnswers >= 25, icon: "✦" },
                { title: copy(locale, "Rodada perfeita", "Perfect round"), description: copy(locale, "Acertou todas em uma rodada", "Got every answer right in a round"), unlocked: quizProgress.perfectRounds >= 1, icon: "★" },
              ].map((achievement) => (
                <div className={`achievement ${achievement.unlocked ? "unlocked" : ""}`} key={achievement.title}>
                  <span>{achievement.icon}</span>
                  <div><strong>{achievement.title}</strong><small>{achievement.description}</small></div>
                  <b>{achievement.unlocked ? "✓" : "· · ·"}</b>
                </div>
              ))}
            </div>

            <h4>{copy(locale, "Últimas descobertas", "Recent discoveries")}</h4>

            {discovered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⌕</div>

                <strong>{copy(locale, "Sua aventura ainda está começando", "Your adventure is just beginning")}</strong>

                <p>
                  {copy(locale, "Abra a ficha de um Pokémon na Pokédex para registrar sua primeira descoberta.", "Open a Pokémon profile in the Pokédex to record your first discovery.")}
                </p>

                <button
                  className="primary-button"
                  onClick={() => setTab("dex")}
                >
                  {copy(locale, "Ir para a Pokédex", "Go to Pokédex")} ↗
                </button>
              </div>
            ) : (
              <div className="discovered-list">
                {discovered

                  .slice(-8)

                  .reverse()

                  .map((name) => (
                    <button key={name} onClick={() => void openPokemon(name)}>
                      {formatPokemonName(name)} <span>{copy(locale, "Ver ficha", "View profile")} ↗</span>
                    </button>
                  ))}
              </div>
            )}
          </section>
        ) : tab === "assistant" ? (
          <AssistantPanel
            locale={locale}
            pokemon={assistantPokemon}
            contextLoading={teamDetailsLoading && teamNames.length > 0}
          />
        ) : tab === "quiz" ? (
          <section className="quiz-panel" aria-labelledby="quiz-title">
            <div className="journey-header quiz-header">
              <div>
                <span className="eyebrow">{copy(locale, "DESAFIO DA POKÉDEX", "POKÉDEX CHALLENGE")}</span>
                <h3 id="quiz-title">{copy(locale, "Quiz Pokémon", "Pokémon quiz")}</h3>
              </div>
              <span className="calculator-generation">
                {copy(locale, "Recorde de acertos seguidos", "Best answer streak")}: {quizProgress.bestStreak}
              </span>
            </div>
            <p className="quiz-description">
              {copy(locale, "Responda cinco perguntas rápidas sobre tipos e atributos-base, usando dados da PokéAPI. Seu progresso fica salvo neste dispositivo.", "Answer five quick questions about types and base stats using PokéAPI data. Your progress is saved on this device.")}
            </p>

            {quizLoading ? (
              <div className="quiz-loading" role="status">
                <div className="spinner" />
                <strong>{copy(locale, "Preparando seu desafio...", "Preparing your quiz...")}</strong>
              </div>
            ) : quizComplete ? (
              <div className="quiz-result">
                <span className="quiz-result-icon">{quizAnswers.every(Boolean) ? "✦" : "❖"}</span>
                <span className="eyebrow">{copy(locale, "RODADA CONCLUÍDA", "ROUND COMPLETE")}</span>
                <h4>
                  {quizAnswers.filter(Boolean).length}/{quizQuestions.length}{" "}
                  {copy(locale, "respostas corretas", "correct answers")}
                </h4>
                <p>
                  {quizAnswers.every(Boolean)
                    ? copy(locale, "Perfeito! Você acertou todas as perguntas.", "Perfect! You got every question right.")
                    : copy(locale, "Boa rodada! Continue explorando para aprender ainda mais.", "Nice round! Keep exploring to learn even more.")}
                </p>
                <p className="quiz-record">
                  {copy(locale, "Recorde de acertos seguidos", "Best answer streak")}:{" "}
                  {quizProgress.bestStreak}
                </p>
                <button className="primary-button" onClick={() => void startQuiz()}>
                  {copy(locale, "Jogar novamente", "Play again")} ↻
                </button>
              </div>
            ) : quizQuestions.length > 0 ? (
              (() => {
                const question = quizQuestions[quizQuestionIndex];
                const answeredCorrectly =
                  quizSelectedAnswer !== null &&
                  isCorrectAnswer(question, quizSelectedAnswer);
                const answerLabel = (answer: string) =>
                  question.kind === "type"
                    ? copy(locale, getPortugueseType(answer), TYPE_LABELS[answer])
                    : locale === "pt-BR"
                      ? getPortugueseStat(answer)
                      : ENGLISH_STATS[answer] ?? formatPokemonName(answer);
                return (
                  <div className="quiz-question-card">
                    <div className="quiz-progress-header">
                      <span>
                        {copy(locale, "Pergunta", "Question")} {quizQuestionIndex + 1}/{quizQuestions.length}
                      </span>
                      <strong>
                        {copy(locale, "Pontos", "Score")}: {quizAnswers.filter(Boolean).length}
                      </strong>
                    </div>
                    <div
                      className={`quiz-progress-track${quizSelectedAnswer !== null ? " answered" : ""}`}
                      role="progressbar"
                      aria-label={copy(locale, "Progresso do quiz", "Quiz progress")}
                      aria-valuenow={quizQuestionIndex + (quizSelectedAnswer ? 1 : 0)}
                      aria-valuemin={0}
                      aria-valuemax={quizQuestions.length}
                    >
                      <div style={{ width: `${((quizQuestionIndex + (quizSelectedAnswer ? 1 : 0)) / quizQuestions.length) * 100}%` }} />
                    </div>
                    <div className="quiz-prompt">
                      <img src={getArtwork(question.pokemon)} alt="" />
                      <div>
                        <span className="eyebrow">
                          {question.kind === "type"
                            ? copy(locale, "TIPO POKÉMON", "POKÉMON TYPE")
                            : copy(locale, "ATRIBUTOS-BASE", "BASE STATS")}
                        </span>
                        <h4>
                          {question.kind === "type"
                            ? copy(locale, `Qual é o tipo principal de ${formatPokemonName(question.pokemon.name)}?`, `What is ${formatPokemonName(question.pokemon.name)}'s primary type?`)
                            : copy(locale, `Qual atributo base tem o maior valor em ${formatPokemonName(question.pokemon.name)}?`, `Which base stat has the highest value for ${formatPokemonName(question.pokemon.name)}?`)}
                        </h4>
                      </div>
                    </div>
                    <div className="quiz-options">
                      {question.options.map((answer) => {
                        const correctOption = question.correctAnswers.includes(answer);
                        const chosenWrong =
                          quizSelectedAnswer === answer && !correctOption;
                        const className = quizSelectedAnswer === null
                          ? ""
                          : correctOption
                            ? "correct"
                            : chosenWrong
                              ? "incorrect"
                              : "";
                        return (
                          <button
                            className={`quiz-option ${className}`}
                            key={answer}
                            disabled={quizSelectedAnswer !== null}
                            onClick={() => answerQuizQuestion(answer)}
                          >
                            <span>{answerLabel(answer)}</span>
                            {quizSelectedAnswer !== null && correctOption && <b>✓</b>}
                            {chosenWrong && <b>×</b>}
                          </button>
                        );
                      })}
                    </div>
                    {quizSelectedAnswer !== null && (
                      <div className={`quiz-feedback ${answeredCorrectly ? "success" : "miss"}`} role="status">
                        <strong>
                          {answeredCorrectly
                            ? copy(locale, "Resposta certa!", "Correct!")
                            : copy(locale, "Quase! A resposta correta é:", "Not quite! The correct answer is:")}
                        </strong>
                        {!answeredCorrectly && (
                          <span>{question.correctAnswers.map(answerLabel).join(" / ")}</span>
                        )}
                      </div>
                    )}
                    {quizSelectedAnswer === null ? (
                      <p className="quiz-hint">{copy(locale, "Escolha uma resposta para continuar.", "Choose an answer to continue.")}</p>
                    ) : (
                      <button className="primary-button quiz-next" onClick={advanceQuiz}>
                        {quizQuestionIndex + 1 === quizQuestions.length
                          ? copy(locale, "Ver resultado", "See results")
                          : copy(locale, "Próxima pergunta", "Next question")} →
                      </button>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="quiz-intro">
                <div className="quiz-intro-stats">
                  <div><strong>{quizProgress.roundsPlayed}</strong><span>{copy(locale, "rodadas", "rounds")}</span></div>
                  <div><strong>{quizProgress.correctAnswers}</strong><span>{copy(locale, "acertos", "correct answers")}</span></div>
                  <div><strong>{quizProgress.perfectRounds}</strong><span>{copy(locale, "rodadas perfeitas", "perfect rounds")}</span></div>
                </div>
                <p>{copy(locale, "Cada rodada tem cinco perguntas. Veja o feedback após cada resposta e tente conquistar uma rodada perfeita!", "Each round has five questions. Get feedback after every answer and try to complete a perfect round!")}</p>
                <button className="primary-button" onClick={() => void startQuiz()}>
                  {copy(locale, "Começar desafio", "Start quiz")} →
                </button>
              </div>
            )}
            <p className="quiz-note">
              {copy(locale, "As perguntas usam os tipos e atributos-base registrados na PokéAPI; não há perguntas de curiosidades sem fonte.", "Questions use types and base stats listed in PokéAPI; no unsourced trivia is used.")}
            </p>
          </section>
        ) : tab === "calculator" ? (
          <section className="type-calculator">
            <div className="journey-header">
              <div>
                <span className="eyebrow">{copy(locale, "FERRAMENTA DE BATALHA", "BATTLE TOOL")}</span>
                <h3>{copy(locale, "Calculadora de tipos", "Type effectiveness calculator")}</h3>
              </div>
              <span className="calculator-generation">{copy(locale, "Geração VI em diante", "Generation VI onward")}</span>
            </div>
            <p>{copy(locale, "Consulte o multiplicador de um tipo atacante contra Pokémon de um ou dois tipos. O cálculo usa a tabela padrão da Geração VI em diante.", "Check an attacking type's multiplier against a Pokémon with one or two types. This uses the standard type chart from Generation VI onward.")}</p>
            <div className="calculator-controls">
              {[
                {
                  label: copy(locale, "Tipo atacante", "Attacking type"),
                  value: attackingType,
                  setValue: setAttackingType,
                },
                {
                  label: copy(locale, "Tipo defensor 1", "Defending type 1"),
                  value: defendingType1,
                  setValue: setDefendingType1,
                },
                {
                  label: copy(locale, "Tipo defensor 2 (opcional)", "Defending type 2 (optional)"),
                  value: defendingType2,
                  setValue: setDefendingType2,
                  optional: true,
                },
              ].map((control) => (
                <label className="select-wrap" key={control.label}>
                  <span>{control.label}</span>
                  <select value={control.value} onChange={(event) => control.setValue(event.target.value)}>
                    {control.optional && <option value="none">{copy(locale, "Nenhum", "None")}</option>}
                    {POKEMON_TYPES.map((type) => (
                      <option key={type} value={type}>{copy(locale, getPortugueseType(type), TYPE_LABELS[type])}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className={`effectiveness-result ${effectiveness === 0 ? "immune" : effectiveness > 1 ? "super-effective" : effectiveness < 1 ? "not-effective" : ""}`} aria-live="polite">
              <span>{copy(locale, getPortugueseType(attackingType), TYPE_LABELS[attackingType])} → {[defendingType1, defendingType2].filter((type) => type !== "none").map((type) => copy(locale, getPortugueseType(type), TYPE_LABELS[type])).join(" / ")}</span>
              <strong>{effectiveness}×</strong>
              <small>{effectiveness === 0 ? copy(locale, "Imune", "No effect") : effectiveness >= 2 ? copy(locale, "Super eficaz", "Super effective") : effectiveness < 1 ? copy(locale, "Pouco eficaz", "Not very effective") : copy(locale, "Dano normal", "Normal damage")}</small>
            </div>
            <p className="calculator-note">{copy(locale, "O multiplicador considera apenas a relação entre tipos; não inclui STAB, habilidades, clima ou diferenças entre jogos.", "This multiplier only reflects type matchups; it does not include STAB, abilities, weather, or game-specific differences.")}</p>
          </section>
        ) : tab === "team" ? (
          <section className="team-builder" aria-labelledby="team-builder-title">
            <div className="journey-header">
              <div>
                <span className="eyebrow">{copy(locale, "FERRAMENTA DE EQUIPE", "TEAM TOOL")}</span>
                <h3 id="team-builder-title">{copy(locale, "Montador de equipes", "Pokémon team builder")}</h3>
              </div>
              <span className="calculator-generation">
                {teamNames.length}/{MAX_TEAM_SIZE} {copy(locale, "Pokémon", "Pokémon")}
              </span>
            </div>
            <p className="team-description">
              {copy(locale, "Monte uma equipe e confira pontos de atenção defensivos e cobertura de tipos. A análise considera apenas tipos, não golpes, habilidades ou regras de um jogo específico.", "Build a team and review defensive matchups and type coverage. The analysis uses types only, not moves, abilities, or game-specific rules.")}
            </p>
            <div className="team-toolbar">
              <button className="secondary-button" onClick={exportTeamBackup} disabled={teamNames.length === 0}>
                {copy(locale, "Exportar backup", "Export backup")}
              </button>
              <button className="secondary-button" onClick={() => teamImportRef.current?.click()} disabled={teamImporting}>
                {teamImporting ? copy(locale, "Validando backup...", "Validating backup...") : copy(locale, "Importar backup", "Import backup")}
              </button>
              <button className="secondary-button" onClick={() => void shareTeamImage()} disabled={teamNames.length === 0 || teamSharing || teamDetailsLoading}>
                {teamSharing ? copy(locale, "Preparando imagem...", "Preparing image...") : copy(locale, "Compartilhar imagem", "Share image")}
              </button>
              <input
                ref={teamImportRef}
                className="sr-only"
                type="file"
                accept="application/json,.json"
                hidden
                aria-label={copy(locale, "Selecionar backup de equipe JSON", "Choose JSON team backup")}
                onChange={(event) => void importTeamBackup(event)}
              />
            </div>
            {teamMessage && <p className="team-status" role="status" aria-live="polite">{teamMessage}</p>}
            <div className="team-controls">
              <div className="team-picker">
                <label className="select-wrap" htmlFor="team-search">
                  <span>{copy(locale, "Buscar Pokémon por nome ou número", "Search Pokémon by name or number")}</span>
                  <input
                    id="team-search"
                    type="search"
                    value={teamSearch}
                    autoComplete="off"
                    placeholder={teamCatalogLoading ? copy(locale, "Carregando Pokédex...", "Loading Pokédex...") : copy(locale, "Ex.: Pikachu ou 25", "e.g. Pikachu or 25")}
                    onChange={(event) => {
                      setTeamSearch(event.target.value);
                      setTeamCandidate("");
                    }}
                    disabled={teamCatalogLoading || teamCatalog.length === 0 || teamNames.length >= MAX_TEAM_SIZE}
                    aria-controls="team-search-results"
                    aria-describedby="team-picker-help"
                  />
                </label>
                <small id="team-picker-help" className="team-picker-help">
                  {copy(locale, "Escolha um resultado para adicioná-lo.", "Choose a result to add it.")}
                </small>
                {filteredTeamCatalog.length > 0 && teamNames.length < MAX_TEAM_SIZE && (
                  <ul id="team-search-results" className="team-search-results" aria-label={copy(locale, "Resultados da busca", "Search results")}>
                    {filteredTeamCatalog.map((pokemon) => {
                      const id = pokemon.url.match(/\/pokemon\/(\d+)\//)?.[1] ?? "";
                      const selectedCandidate = teamCandidate === pokemon.name;
                      return (
                        <li key={pokemon.name}>
                          <button
                            type="button"
                            className={selectedCandidate ? "selected" : ""}
                            aria-pressed={selectedCandidate}
                            onClick={() => {
                              setTeamCandidate(pokemon.name);
                              setTeamSearch(formatPokemonName(pokemon.name));
                            }}
                          >
                            <span>{formatPokemonName(pokemon.name)}</span>
                            <small>#{id.padStart(4, "0")}</small>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {teamSearch.trim() && filteredTeamCatalog.length === 0 && !teamCatalogLoading && (
                  <p className="team-no-results">{copy(locale, "Nenhum Pokémon corresponde à busca.", "No Pokémon match this search.")}</p>
                )}
              </div>
              <button
                className="primary-button"
                onClick={() => addTeamMember()}
                disabled={
                  teamCatalogLoading ||
                  teamCatalog.length === 0 ||
                  !teamCandidate ||
                  teamNames.length >= MAX_TEAM_SIZE ||
                  teamNames.includes(teamCandidate)
                }
              >
                ＋ {copy(locale, "Adicionar à equipe", "Add to team")}
              </button>
            </div>
            {teamNames.length === MAX_TEAM_SIZE && (
              <p className="team-capacity-note">{copy(locale, "A equipe atingiu o limite de seis Pokémon.", "Your team has reached the six-Pokémon limit.")}</p>
            )}

            {teamNames.length === 0 ? (
              <div className="empty-state team-empty">
                <div className="empty-icon">◈</div>
                <strong>{copy(locale, "Sua equipe começa aqui", "Your team starts here")}</strong>
                <p>{copy(locale, "Adicione até seis Pokémon para analisar as combinações de tipos.", "Add up to six Pokémon to review your team's type matchups.")}</p>
              </div>
            ) : (
              <>
                <div className="team-grid">
                  {teamNames.map((name) => {
                    const pokemon = teamDetails.find((item) => item.name === name);
                    return (
                      <article className="team-member" key={name}>
                        <div className={`team-member-art art-${pokemon?.types[0]?.type.name ?? "normal"}`}>
                          {pokemon ? (
                            <img src={getArtwork(pokemon)} alt="" loading="lazy" />
                          ) : (
                            <span className="team-member-placeholder" aria-hidden="true">◈</span>
                          )}
                        </div>
                        <div className="team-member-info">
                          <strong>{pokemon ? formatPokemonName(pokemon.name) : formatPokemonName(name)}</strong>
                          {pokemon ? (
                            <div className="type-pills">
                              {pokemon.types.map((type) => (
                                <span
                                  key={type.type.name}
                                  style={{ backgroundColor: TYPE_COLORS[type.type.name] ?? "#999" }}
                                >
                                  {copy(locale, getPortugueseType(type.type.name), TYPE_LABELS[type.type.name])}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <small>{copy(locale, "Carregando dados...", "Loading data...")}</small>
                          )}
                          <div className="team-member-actions">
                            <button
                              className="team-profile-button"
                              disabled={!pokemon}
                              onClick={() => void openPokemon(name)}
                            >
                              {copy(locale, "Ver ficha", "View profile")}
                            </button>
                            <button
                              className="team-remove-button"
                              aria-label={`${copy(locale, "Remover", "Remove")} ${formatPokemonName(name)} ${copy(locale, "da equipe", "from team")}`}
                              onClick={() => setTeamNames((previous) => previous.filter((memberName) => memberName !== name))}
                            >
                              {copy(locale, "Remover", "Remove")}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <section className="team-analysis" aria-labelledby="team-analysis-title">
                  <div className="team-analysis-heading">
                    <div>
                      <span className="eyebrow">{copy(locale, "LEITURA DE TIPOS", "TYPE OVERVIEW")}</span>
                      <h4 id="team-analysis-title">{copy(locale, "Análise da equipe", "Team analysis")}</h4>
                    </div>
                    {teamDetailsLoading && <span className="team-loading" role="status">{copy(locale, "Atualizando análise...", "Updating analysis...")}</span>}
                  </div>
                  {teamMembers.length === teamNames.length && teamNames.length > 0 && (
                    <>
                      <div className="team-matchup-grid">
                        {[
                          { title: copy(locale, "Fraquezas", "Weaknesses"), entries: teamAnalysis.weaknesses, empty: copy(locale, "Nenhuma fraqueza identificada", "No weaknesses identified") },
                          { title: copy(locale, "Resistências", "Resistances"), entries: teamAnalysis.resistances, empty: copy(locale, "Nenhuma resistência identificada", "No resistances identified") },
                          { title: copy(locale, "Imunidades", "Immunities"), entries: teamAnalysis.immunities, empty: copy(locale, "Nenhuma imunidade identificada", "No immunities identified") },
                        ].map((group) => (
                          <section className="team-matchup-group" key={group.title}>
                            <h5>{group.title}</h5>
                            {group.entries.length > 0 ? (
                              <div className="team-type-list">
                                {group.entries.map((entry) => (
                                  <span className="team-type-chip" key={entry.type} title={`${entry.memberCount} ${copy(locale, "integrante(s)", "team member(s)")}`}>
                                    <i style={{ backgroundColor: TYPE_COLORS[entry.type] ?? "#999" }} />
                                    {copy(locale, getPortugueseType(entry.type), TYPE_LABELS[entry.type])}
                                    <small>{entry.memberCount}</small>
                                    <b>{entry.multiplier}×</b>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="team-empty-copy">{group.empty}</p>
                            )}
                          </section>
                        ))}
                      </div>
                      <section className="team-coverage">
                        <h5>{copy(locale, "Cobertura ofensiva por STAB", "Offensive STAB coverage")}</h5>
                        <p>{copy(locale, "Tipos contra os quais ao menos um integrante tem vantagem por um de seus próprios tipos.", "Types that at least one member can hit super effectively with one of its own types.")}</p>
                        <div className="team-type-list">
                          {teamAnalysis.offensiveCoverage.map((type) => (
                            <span className="team-type-chip" key={type}>
                              <i style={{ backgroundColor: TYPE_COLORS[type] ?? "#999" }} />
                              {copy(locale, getPortugueseType(type), TYPE_LABELS[type])}
                            </span>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </section>
              </>
            )}
          </section>
        ) : (
          <>
            <section className="filters">
              <label className="search-box">
                <span>⌕</span>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={copy(locale, "Buscar por nome ou número...", "Search by name or number...")}
                />

                <kbd>↵</kbd>
              </label>

              <label className="select-wrap">
                <span>{copy(locale, "Geração", "Generation")}</span>

                <select
                  value={generation}
                  onChange={(e) => {
                    setGeneration(e.target.value);

                    setTypeFilter("all");
                    setSecondaryTypeFilter("all");
                  }}
                >
                  {GENERATIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {copy(locale, item.label, item.value === "all" ? "All generations" : `Generation ${["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][Number(item.value) - 1]}${item.value === "all" ? "" : ` · ${["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea"][Number(item.value) - 1]}`}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="select-wrap type-select">
                <span>{copy(locale, "Tipo", "Type")}</span>

                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    if (e.target.value === secondaryTypeFilter) setSecondaryTypeFilter("all");
                  }}
                >
                  <option value="all">{copy(locale, "Todos os tipos", "All types")}</option>

                  {Object.keys(TYPE_COLORS).map((type) => (
                    <option key={type} value={type}>
                      {copy(locale, getPortugueseType(type), TYPE_LABELS[type])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-wrap type-select">
                <span>{copy(locale, "Tipo secundário", "Second type")}</span>
                <select
                  value={secondaryTypeFilter}
                  onChange={(event) => {
                    setSecondaryTypeFilter(event.target.value);
                    if (event.target.value === typeFilter) setTypeFilter("all");
                  }}
                >
                  <option value="all">{copy(locale, "Qualquer tipo", "Any type")}</option>
                  {Object.keys(TYPE_COLORS).map((type) => (
                    <option key={type} value={type} disabled={type === typeFilter}>
                      {copy(locale, getPortugueseType(type), TYPE_LABELS[type])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-wrap ability-select">
                <span>{copy(locale, "Habilidade", "Ability")}</span>
                <select value={abilityFilter} onChange={(event) => setAbilityFilter(event.target.value)}>
                  <option value="all">{copy(locale, "Todas as habilidades", "All abilities")}</option>
                  {abilityOptions.map((ability) => (
                    <option key={ability} value={ability}>{formatPokemonName(ability)}</option>
                  ))}
                </select>
              </label>
              <label className="select-wrap sort-select">
                <span>{copy(locale, "Ordenar por", "Sort by")}</span>
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "number" | "name")}>
                  <option value="number">{copy(locale, "Número da Pokédex", "Pokédex number")}</option>
                  <option value="name">{copy(locale, "Nome", "Name")}</option>
                </select>
              </label>
            </section>

            <div className="results-line">
              <span>
                {loading || typeLoading || abilityLoading
                  ? copy(locale, "Carregando Pokédex...", "Loading Pokédex...")
                  : copy(locale, `${filteredList.length} Pokémon encontrados`, `${filteredList.length} Pokémon found`)}
              </span>

              <span>{sortOrder === "number" ? copy(locale, "Ordenados pelo número da Pokédex", "Sorted by Pokédex number") : copy(locale, "Ordenados por nome", "Sorted by name")}</span>
            </div>

            {loading || typeLoading || abilityLoading ? (
              <div className="loading-grid">
                {Array.from({ length: 12 }, (_, i) => (
                  <div className="skeleton" key={i} />
                ))}
              </div>
            ) : filteredList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⌕</div>

                <strong>{copy(locale, "Nenhum Pokémon encontrado", "No Pokémon found")}</strong>

                <p>{copy(locale, "Tente outro nome, número, geração, tipo ou habilidade.", "Try another name, number, generation, type, or ability.")}</p>

                <button
                  className="secondary-button"
                  onClick={() => {
                    setSearch("");

                    setGeneration("all");
                    setTypeFilter("all");
                    setSecondaryTypeFilter("all");
                    setAbilityFilter("all");
                    setSortOrder("number");

                    if (tab === "favorites") setTab("dex");
                  }}
                >
                  {copy(locale, "Limpar filtros", "Clear filters")}
                </button>
              </div>
            ) : (
              <div className="pokemon-grid">
                {visibleList.map((item, index) => {
                  const id = Number(
                    item.url.match(/\/pokemon\/(\d+)\//)?.[1] ?? index + 1,
                  );

                  const detail = detailMap.get(item.name);

                  const image = detail
                    ? getArtwork(detail)
                    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

                  const isFav = favorites.includes(item.name);

                  return (
                    <article className="pokemon-card" key={item.name}>
                      <div className="card-top">
                        <span className="pokemon-number">
                          Nº {String(id).padStart(4, "0")}
                        </span>

                        <div className="card-actions">
                          <button
                            className={`favorite-button ${isFav ? "favorited" : ""}`}
                            aria-label={isFav
                              ? `${copy(locale, "Remover dos favoritos", "Remove from favorites")}: ${formatPokemonName(item.name)}`
                              : `${copy(locale, "Adicionar aos favoritos", "Add to favorites")}: ${formatPokemonName(item.name)}`}
                            aria-pressed={isFav}
                            onClick={() => {
                              toggleFavorite(item.name);
                            }}
                          >
                            {isFav ? "♥" : "♡"}
                          </button>
                          <button
                            className={`compare-button ${compareNames.includes(item.name) ? "selected" : ""}`}
                            aria-label={compareNames.includes(item.name) ? copy(locale, "Remover da comparação", "Remove from comparison") : copy(locale, "Comparar Pokémon", "Compare Pokémon")}
                            title={compareNames.includes(item.name) ? copy(locale, "Remover da comparação", "Remove from comparison") : copy(locale, "Adicionar à comparação", "Add to comparison")}
                            aria-pressed={compareNames.includes(item.name)}
                            onClick={() => {
                              toggleCompare(item.name);
                            }}
                          >
                            ⇄
                          </button>
                        </div>
                      </div>

                      <button
                        className="card-open-button"
                        aria-label={`${copy(locale, "Abrir ficha de", "Open profile for")} ${formatPokemonName(item.name)}`}
                        aria-haspopup="dialog"
                        onClick={() => void openPokemon(item.name)}
                      >
                        <div className={`pokemon-art art-${detail?.types[0]?.type.name ?? "normal"}`}>
                          <img
                            loading="lazy"
                            src={image}
                            alt=""
                            onError={(e) => { e.currentTarget.style.opacity = "0.15"; }}
                          />
                        </div>
                        <div className="card-info">
                          <h3>{formatPokemonName(item.name)}</h3>
                          <div className="type-pills">
                            {detail?.types.map((t) => (
                              <span
                                key={t.type.name}
                                style={{ backgroundColor: TYPE_COLORS[t.type.name] ?? "#999" }}
                              >
                                {copy(locale, getPortugueseType(t.type.name), TYPE_LABELS[t.type.name])}
                              </span>
                            ))}
                          </div>
                        </div>
                        {discovered.includes(item.name) && (
                          <span className="discovered-mark">✓ {copy(locale, "Descoberto", "Discovered")}</span>
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}

            {!loading && visibleList.length < filteredList.length && (
              <div className="load-more-wrap">
                <button className="secondary-button load-more" onClick={() => setVisibleCount((count) => count + 32)}>
                  {copy(locale, "Carregar mais Pokémon", "Load more Pokémon")} · {visibleList.length}/{filteredList.length}
                </button>
              </div>
            )}
            {compareNames.length > 0 && (
              <aside className="compare-dock" aria-live="polite">
                <span>{copy(locale, `${compareNames.length} selecionado(s)`, `${compareNames.length} selected`)}</span>
                <div>
                  {compareNames.map((name) => (
                    <button key={name} onClick={() => toggleCompare(name)} aria-label={`${copy(locale, "Remover", "Remove")} ${formatPokemonName(name)}`}>
                      {formatPokemonName(name)} ×
                    </button>
                  ))}
                  <button className="primary-button" disabled={compareNames.length < 2} onClick={() => void openComparison()}>
                    {copy(locale, "Comparar", "Compare")} ⇄
                  </button>
                </div>
              </aside>
            )}

            {!loading && filteredList.length > 0 && (
              <p className="api-note">
                {copy(locale, "Dados de espécies fornecidos pela PokéAPI. As imagens são carregadas conforme a disponibilidade da fonte.", "Species data provided by PokéAPI. Images load as available from the source.")}
              </p>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <div className="brand footer-brand">
          <span className="brand-mark">
            <span />
          </span>

          <span>
            <strong>Poképedia</strong>

            <small>EXPLORER</small>
          </span>
        </div>

        <p>
          {copy(locale, "Feito para quem quer redescobrir o mundo Pokémon. Este é um projeto de fã, não oficial.", "Made for everyone rediscovering the Pokémon world. This is an unofficial fan project.")}
        </p>

        <span>{copy(locale, "Dados: PokéAPI · © Pokémon / Nintendo / Game Freak", "Data: PokéAPI · © Pokémon / Nintendo / Game Freak")}</span>
      </footer>

      {detailLoading && (
        <div className="modal-backdrop" onClick={() => setDetailLoading(false)}>
          <div
            className="modal-loading"
            role="dialog"
            aria-modal="true"
            aria-label={copy(locale, "Consultando a Pokédex...", "Consulting the Pokédex...")}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="spinner" />

            <strong>{copy(locale, "Consultando a Pokédex...", "Consulting the Pokédex...")}</strong>
          </div>
        </div>
      )}

      {selected && !detailLoading && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="pokemon-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${copy(locale, "Ficha de", "Profile for")} ${formatPokemonName(selected.name)}`}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label={copy(locale, "Fechar", "Close")}
            >
              ×
            </button>

            <div
              className={`modal-art art-${selected.types[0]?.type.name ?? "normal"}`}
            >
              <span className="modal-number">
                Nº {String(selected.id).padStart(4, "0")}
              </span>

              <img
                src={getArtwork(selected)}
                alt={formatPokemonName(selected.name)}
              />
            </div>

            <div className="modal-content">
              <span className="eyebrow">{copy(locale, "FICHA DA ESPÉCIE", "SPECIES PROFILE")}</span>

              <div className="modal-title-row">
                <h2>{formatPokemonName(selected.name)}</h2>

                <button
                  className={`modal-favorite ${selectedFavorite ? "favorited" : ""}`}
                  onClick={() => toggleFavorite(selected.name)}
                  aria-pressed={selectedFavorite}
                >
                  {selectedFavorite ? `♥ ${copy(locale, "Favorito", "Favorite")}` : `♡ ${copy(locale, "Favoritar", "Add favorite")}`}
                </button>
              </div>
              <button
                className={`modal-team-button ${teamNames.includes(selected.name) ? "in-team" : ""}`}
                onClick={() => {
                  if (teamNames.includes(selected.name)) {
                    setTeamNames((previous) => previous.filter((name) => name !== selected.name));
                    setTeamMessage(copy(locale, `${formatPokemonName(selected.name)} foi removido da equipe.`, `${formatPokemonName(selected.name)} was removed from the team.`));
                  } else {
                    addTeamMember(selected.name);
                  }
                }}
                disabled={!teamNames.includes(selected.name) && teamNames.length >= MAX_TEAM_SIZE}
                aria-pressed={teamNames.includes(selected.name)}
              >
                {teamNames.includes(selected.name)
                  ? copy(locale, "✓ Na sua equipe", "✓ In your team")
                  : `＋ ${copy(locale, "Adicionar à equipe", "Add to team")}`}
              </button>

              <div className="type-pills modal-types">
                {selected.types.map((t) => (
                  <span
                    key={t.type.name}
                    style={{
                      backgroundColor: TYPE_COLORS[t.type.name] ?? "#999",
                    }}
                  >
                    {copy(locale, getPortugueseType(t.type.name), TYPE_LABELS[t.type.name])}
                  </span>
                ))}
              </div>

              <p className="flavor-text">
                {species?.flavor_text_entries

                  .find((entry) => entry.language.name === (locale === "pt-BR" ? "pt" : "en"))

                  ?.flavor_text.replace(/[\n\f]/g, " ") ||
                  species?.flavor_text_entries

                    .find((entry) => entry.language.name === (locale === "pt-BR" ? "en" : "pt"))

                    ?.flavor_text.replace(/[\n\f]/g, " ") ||
                  copy(locale, "Descrição ainda não disponível em português.", "Description not available yet.")}
              </p>

              <div className="modal-facts">
                <div>
                  <span>{copy(locale, "Altura", "Height")}</span>

                  <strong>
                    {(selected.height / 10).toLocaleString(locale)} m
                  </strong>
                </div>

                <div>
                  <span>{copy(locale, "Peso", "Weight")}</span>

                  <strong>
                    {(selected.weight / 10).toLocaleString(locale)} kg
                  </strong>
                </div>

                <div>
                  <span>{copy(locale, "Geração", "Generation")}</span>

                  <strong>
                    {species
                      ? `${copy(locale, "Geração", "Generation")} ${generationNumber(species.generation.name) || "—"}`
                      : "—"}
                  </strong>
                </div>
              </div>

              <div className="species-extra">
                <div>
                  <span>{copy(locale, "Categoria", "Category")}</span>
                  <strong>{species?.genera?.find((item) => item.language.name === (locale === "pt-BR" ? "pt" : "en"))?.genus ?? "—"}</strong>
                </div>
                <div>
                  <span>{copy(locale, "Habitat", "Habitat")}</span>
                  <strong>{species?.habitat?.name ? formatPokemonName(species.habitat.name) : copy(locale, "Desconhecido", "Unknown")}</strong>
                </div>
                <div>
                  <span>{copy(locale, "Taxa de captura", "Catch rate")}</span>
                  <strong>{species?.capture_rate ?? "—"} / 255</strong>
                </div>
              </div>

              <div className="training-facts">
              <span>{copy(locale, "Experiência-base", "Base experience")}: <strong>{selected.base_experience ?? "—"}</strong></span>
              <span>{copy(locale, "Felicidade-base", "Base happiness")}: <strong>{species?.base_happiness ?? "—"}</strong></span>
              <span>{copy(locale, "Total de atributos", "Base stat total")}: <strong>{totalBaseStats}</strong></span>
              <span>{copy(locale, "Rendimento de esforço", "Effort yield")}: <strong>{totalEffortYield}</strong></span>
              </div>

              {species?.varieties && species.varieties.length > 1 && (
              <>
                <h3>{copy(locale, "Formas registradas na PokéAPI", "Forms listed by PokéAPI")}</h3>
                <p className="forms-note">{copy(locale, "A disponibilidade e as diferenças entre formas podem variar conforme o jogo.", "Availability and differences between forms can vary by game.")}</p>
                <div className="forms-list">
                  {species.varieties.map((variety) => (
                    <button
                      key={variety.pokemon.name}
                      className={variety.pokemon.name === selected.name ? "current-form" : ""}
                      onClick={() => void openPokemon(variety.pokemon.name)}
                    >
                      {formatPokemonName(variety.pokemon.name)}
                      {variety.is_default && <small>{copy(locale, "Forma padrão", "Default form")}</small>}
                    </button>
                  ))}
                </div>
              </>
              )}

              <h3>{copy(locale, "Habilidades", "Abilities")}</h3>

              <div className="ability-list">
                {selected.abilities.map((a) => (
                  <span key={a.ability.name}>
                    {formatPokemonName(a.ability.name)}

                    {a.is_hidden ? ` · ${copy(locale, "Oculta", "Hidden")}` : ""}
                  </span>
                ))}
              </div>

              <h3>{copy(locale, "Estatísticas base", "Base stats")}</h3>

              <div className="stats-list">
                {selected.stats.map((s) => (
                  <div className="stat-row" key={s.stat.name}>
                    <span>
                      {locale === "pt-BR" ? getPortugueseStat(s.stat.name) : (ENGLISH_STATS[s.stat.name] ?? formatPokemonName(s.stat.name))}
                      {s.effort ? <small className="effort-yield">+{s.effort} EV</small> : null}
                    </span>

                    <div className="stat-track">
                      <div
                        style={{
                          width: `${Math.min(100, (s.base_stat / 255) * 100)}%`,
                        }}
                      />
                    </div>

                    <strong>{s.base_stat}</strong>
                  </div>
                ))}
              </div>

              <h3>{copy(locale, "Linha evolutiva", "Evolution line")}</h3>

              {evolution ? (
                <>
                  <div className="evolution-tree">
                    <EvolutionBranch
                      node={evolution}
                      locale={locale}
                      onOpen={(name) => void openPokemon(name)}
                    />
                  </div>
                  {evolution.evolves_to.length === 0 && (
                    <p className="muted">{copy(locale, "Esta espécie não possui evoluções registradas na PokéAPI.", "No evolutions are listed for this species in PokéAPI.")}</p>
                  )}
                </>
              ) : (
                <p className="muted">{copy(locale, "Linha evolutiva indisponível.", "Evolution line unavailable.")}</p>
              )}

              <p className="source-note">
                {copy(locale, "As informações variam entre jogos e gerações. Consulte a ficha do jogo específico para detalhes competitivos.", "Information varies between games and generations. Check the specific game's Pokédex for competitive details.")}
              </p>
            </div>
          </section>
        </div>
      )}
      {comparisonOpen && (
        <div className="modal-backdrop" onClick={() => setComparisonOpen(false)}>
          <section className="comparison-modal" role="dialog" aria-modal="true" aria-label={copy(locale, "Comparação de Pokémon", "Pokémon comparison")} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setComparisonOpen(false)} aria-label={copy(locale, "Fechar", "Close")}>×</button>
            <span className="eyebrow">{copy(locale, "LABORATÓRIO", "COMPARISON LAB")}</span>
            <h2>{copy(locale, "Comparar Pokémon", "Compare Pokémon")}</h2>
            <div className="comparison-table-wrap">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>{copy(locale, "Atributo", "Attribute")}</th>
                    {compareDetails.map((pokemon) => <th key={pokemon.id}>{formatPokemonName(pokemon.name)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>{copy(locale, "Tipo", "Type")}</th>
                    {compareDetails.map((pokemon) => <td key={pokemon.id}>{pokemon.types.map((type) => copy(locale, getPortugueseType(type.type.name), TYPE_LABELS[type.type.name])).join(" / ")}</td>)}
                  </tr>
                  <tr>
                    <th>{copy(locale, "Habilidades", "Abilities")}</th>
                    {compareDetails.map((pokemon) => <td key={pokemon.id}>{pokemon.abilities.map((ability) => `${formatPokemonName(ability.ability.name)}${ability.is_hidden ? ` (${copy(locale, "Oculta", "Hidden")})` : ""}`).join(", ")}</td>)}
                  </tr>
                  <tr>
                    <th>{copy(locale, "Altura", "Height")}</th>
                    {compareDetails.map((pokemon) => <td key={pokemon.id}>{(pokemon.height / 10).toLocaleString(locale)} m</td>)}
                  </tr>
                  <tr>
                    <th>{copy(locale, "Peso", "Weight")}</th>
                    {compareDetails.map((pokemon) => <td key={pokemon.id}>{(pokemon.weight / 10).toLocaleString(locale)} kg</td>)}
                  </tr>
                  <tr>
                    <th>{copy(locale, "Experiência-base", "Base experience")}</th>
                    {compareDetails.map((pokemon) => <td key={pokemon.id}>{pokemon.base_experience ?? "—"}</td>)}
                  </tr>
                  <tr>
                    <th>{copy(locale, "Total de atributos", "Base stat total")}</th>
                    {compareDetails.map((pokemon) => <td className="compare-total" key={pokemon.id}>{pokemon.stats.reduce((total, stat) => total + stat.base_stat, 0)}</td>)}
                  </tr>
                  {compareDetails[0]?.stats.map((stat) => (
                    <tr key={stat.stat.name}>
                      <th>{locale === "pt-BR" ? getPortugueseStat(stat.stat.name) : (ENGLISH_STATS[stat.stat.name] ?? formatPokemonName(stat.stat.name))}</th>
                      {compareDetails.map((pokemon) => (
                        <td className={pokemon.stats.find((entry) => entry.stat.name === stat.stat.name)?.base_stat === Math.max(...compareDetails.map((entry) => entry.stats.find((item) => item.stat.name === stat.stat.name)?.base_stat ?? 0)) ? "compare-leader" : ""} key={pokemon.id}>
                          <span className="compare-stat-value">{pokemon.stats.find((entry) => entry.stat.name === stat.stat.name)?.base_stat ?? "—"}</span>
                          <span className="compare-stat-track"><i style={{ width: `${Math.min(100, ((pokemon.stats.find((entry) => entry.stat.name === stat.stat.name)?.base_stat ?? 0) / 255) * 100)}%` }} /></span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="calculator-note">{copy(locale, "O destaque mostra o maior valor dentro deste grupo. Atributos maiores não significam superioridade em todos os jogos ou estratégias.", "Highlights indicate the highest value in this group. Higher stats do not imply overall superiority across games or strategies.")}</p>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
