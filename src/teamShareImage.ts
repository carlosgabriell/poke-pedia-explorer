import { formatPokemonName, getPortugueseStat, getPortugueseType } from "./api";
import type { PokemonDetail } from "./types";

const TYPE_COLORS: Record<string, string> = {
  normal: "#a8a77a", fire: "#ee8130", water: "#6390f0", electric: "#f7d02c",
  grass: "#7ac74c", ice: "#96d9d6", fighting: "#c22e28", poison: "#a33ea1",
  ground: "#e2bf65", flying: "#a98ff3", psychic: "#f95587", bug: "#a6b91a",
  rock: "#b6a136", ghost: "#735797", dragon: "#6f35fc", dark: "#705746",
  steel: "#b7b7ce", fairy: "#d685ad",
};

const TYPE_LABELS: Record<string, string> = {
  normal: "Normal", fire: "Fire", water: "Water", electric: "Electric",
  grass: "Grass", ice: "Ice", fighting: "Fighting", poison: "Poison",
  ground: "Ground", flying: "Flying", psychic: "Psychic", bug: "Bug",
  rock: "Rock", ghost: "Ghost", dragon: "Dragon", dark: "Dark",
  steel: "Steel", fairy: "Fairy",
};

const STAT_LABELS: Record<string, string> = {
  hp: "HP", attack: "ATK", defense: "DEF", "special-attack": "SpA",
  "special-defense": "SpD", speed: "SPD",
};

function loadArtwork(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "Não foi possível carregar as imagens da equipe. Verifique a conexão e tente novamente.",
        ),
      );
    image.src = url;
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawFitImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
): void {
  const scale = Math.min(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
}

export async function createTeamShareImage(
  pokemon: PokemonDetail[],
  locale: "pt-BR" | "en",
): Promise<Blob> {
  if (pokemon.length === 0 || pokemon.length > 6) {
    throw new Error("Adicione de um a seis Pokémon antes de compartilhar.");
  }

  const artwork = await Promise.all(
    pokemon.map(async (member) => {
      const url =
        member.sprites.other?.["official-artwork"]?.front_default ||
        member.sprites.other?.home?.front_default ||
        member.sprites.front_default;
      if (!url) {
        throw new Error(
          `Não foi possível carregar as imagens da equipe. Verifique a conexão e tente novamente.`,
        );
      }
      return loadArtwork(url);
    }),
  );

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 490 + Math.ceil(pokemon.length / 2) * 330;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar a imagem da equipe.");

  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#102a22");
  background.addColorStop(1, "#1d4032");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#d9f26b";
  context.font = "700 22px Arial, sans-serif";
  context.fillText("POKÉPEDIA EXPLORER", 64, 68);
  context.fillStyle = "#f3f6e9";
  context.font = "700 50px Arial, sans-serif";
  context.fillText(locale === "pt-BR" ? "Minha equipe Pokémon" : "My Pokémon Team", 64, 135);
  context.fillStyle = "#b9c9ba";
  context.font = "400 22px Arial, sans-serif";
  context.fillText(
    locale === "pt-BR" ? `${pokemon.length} de 6 integrantes` : `${pokemon.length} of 6 members`,
    66,
    176,
  );

  const cardWidth = 518;
  const cardHeight = 300;
  const startX = 64;
  const startY = 220;
  const gapX = 36;
  const gapY = 30;

  pokemon.forEach((member, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = startX + column * (cardWidth + gapX);
    const y = startY + row * (cardHeight + gapY);
    const primaryType = member.types[0]?.type.name ?? "normal";
    const accent = TYPE_COLORS[primaryType] ?? "#8cae66";

    roundedRect(context, x, y, cardWidth, cardHeight, 24);
    context.fillStyle = "#f5f7ee";
    context.fill();
    context.save();
    roundedRect(context, x, y, cardWidth, cardHeight, 24);
    context.clip();
    context.fillStyle = `${accent}35`;
    context.beginPath();
    context.arc(x + 106, y + 146, 111, 0, Math.PI * 2);
    context.fill();
    context.restore();

    drawFitImage(context, artwork[index], x + 23, y + 58, 168);
    context.fillStyle = "#7e8b7e";
    context.font = "700 15px Arial, sans-serif";
    context.fillText(`#${String(member.id).padStart(4, "0")}`, x + 220, y + 48);
    context.fillStyle = "#20362b";
    context.font = "700 29px Arial, sans-serif";
    context.fillText(formatPokemonName(member.name).slice(0, 19), x + 220, y + 87);

    let typeX = x + 220;
    member.types.forEach((type) => {
      const label = locale === "pt-BR"
        ? getPortugueseType(type.type.name)
        : (TYPE_LABELS[type.type.name] ?? formatPokemonName(type.type.name));
      context.font = "700 14px Arial, sans-serif";
      const pillWidth = context.measureText(label).width + 24;
      roundedRect(context, typeX, y + 104, pillWidth, 29, 14);
      context.fillStyle = TYPE_COLORS[type.type.name] ?? "#999";
      context.fill();
      context.fillStyle = "#fff";
      context.fillText(label, typeX + 12, y + 124);
      typeX += pillWidth + 8;
    });

    const total = member.stats.reduce((sum, stat) => sum + stat.base_stat, 0);
    context.fillStyle = "#617363";
    context.font = "700 13px Arial, sans-serif";
    const summaryLabel = locale === "pt-BR" ? `TOTAL DE ATRIBUTOS  ${total}` : `BASE STAT TOTAL  ${total}`;
    context.fillText(summaryLabel, x + 220, y + 163);

    const stats = member.stats.slice(0, 6);
    stats.forEach((stat, statIndex) => {
      const statX = x + 220 + (statIndex % 3) * 92;
      const statY = y + 194 + Math.floor(statIndex / 3) * 38;
      context.fillStyle = "#829082";
      context.font = "700 11px Arial, sans-serif";
      context.fillText(STAT_LABELS[stat.stat.name] ?? getPortugueseStat(stat.stat.name).slice(0, 3).toUpperCase(), statX, statY);
      context.fillStyle = "#263a2e";
      context.font = "700 17px Arial, sans-serif";
      context.fillText(String(stat.base_stat), statX, statY + 19);
    });
  });

  context.fillStyle = "#b9c9ba";
  context.font = "400 14px Arial, sans-serif";
  context.fillText("pokeapi.co · Poképedia Explorer", 64, canvas.height - 30);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível exportar a imagem da equipe."));
    }, "image/png");
  });
}
