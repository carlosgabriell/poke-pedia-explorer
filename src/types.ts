export type PokemonSummary = {
  name: string
  url: string
}

export type PokemonType = {
  slot: number
  type: { name: string; url: string }
}

export type PokemonAbility = {
  ability: { name: string; url: string }
  is_hidden: boolean
}

export type PokemonDetail = {
  id: number
  name: string
  height: number
  weight: number
  base_experience: number | null
  sprites: {
    front_default: string | null
    other?: {
      'official-artwork'?: { front_default: string | null }
      home?: { front_default: string | null }
    }
  }
  types: PokemonType[]
  abilities: PokemonAbility[]
  stats: { base_stat: number; effort?: number; stat: { name: string } }[]
  species: { name: string; url: string }
}

export type SpeciesDetail = {
  id: number
  name: string
  generation: { name: string }
  capture_rate?: number
  base_happiness?: number
  habitat?: { name: string } | null
  color?: { name: string }
  genera?: { genus: string; language: { name: string } }[]
  flavor_text_entries: { flavor_text: string; language: { name: string } }[]
  varieties?: { is_default: boolean; pokemon: { name: string } }[]
  evolution_chain: { url: string }
}

export type EvolutionNode = {
  species: { name: string; url: string }
  evolves_to: EvolutionNode[]
  evolution_details: {
    min_level: number | null
    item: { name: string } | null
    trigger?: { name: string } | null
    gender?: number | null
    held_item?: { name: string } | null
    known_move?: { name: string } | null
    known_move_type?: { name: string } | null
    location?: { name: string } | null
    min_happiness?: number | null
    min_affection?: number | null
    time_of_day?: string
    trade_species?: { name: string } | null
  }[]
}
