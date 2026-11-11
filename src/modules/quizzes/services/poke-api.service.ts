import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type PokeApiPokemon = {
  name: string;
  types: Array<{ slot: number; type: { name: string } }>;
};

export type PokemonFact = { name: string; primaryType: string };

const POKEMON = [
  'pikachu',
  'bulbasaur',
  'charmander',
  'squirtle',
  'jigglypuff',
  'meowth',
  'psyduck',
  'eevee',
  'snorlax',
  'gengar',
] as const;

const CACHE_MS = 60 * 60 * 1000;

/**
 * Small, server-side PokéAPI client. Generated quizzes persist their facts, so
 * a game never calls this service after the author has pressed generate.
 */
@Injectable()
export class PokeApiService {
  private cache: { expiresAt: number; facts: PokemonFact[] } | null = null;

  async getStarterFacts(): Promise<PokemonFact[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.facts;

    try {
      const facts = await Promise.all(
        POKEMON.map(async (name) => {
          const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`, {
            signal: AbortSignal.timeout(5000),
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error(`PokéAPI respondió ${response.status}`);
          const pokemon = (await response.json()) as PokeApiPokemon;
          const primary = pokemon.types.find((type) => type.slot === 1)?.type.name;
          if (!primary) throw new Error('Pokémon sin tipo principal');
          return { name: pokemon.name, primaryType: primary };
        }),
      );
      this.cache = { facts, expiresAt: Date.now() + CACHE_MS };
      return facts;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo consultar PokéAPI. Inténtalo de nuevo.',
      );
    }
  }
}
