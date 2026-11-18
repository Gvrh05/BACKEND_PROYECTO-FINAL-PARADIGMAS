import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const DEFAULT_POKEMON_QUIZ_ID = '3ade91d8-a554-453c-9137-1c945ac9fba4';
export const POKEMON_ASSETS = resolve(
  __dirname,
  '../../../../public/seeds/pokemon',
);

interface PokemonEntry {
  name: string;
  types: string[];
  stats: Record<string, number>;
  height: number;
  weight: number;
}

export interface StarterQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  image: string;
  binary?: boolean;
}

const types: Record<string, string> = {
  electric: 'Eléctrico',
  fire: 'Fuego',
  flying: 'Volador',
  grass: 'Planta',
  poison: 'Veneno',
  water: 'Agua',
  ghost: 'Fantasma',
  normal: 'Normal',
  dragon: 'Dragón',
  psychic: 'Psíquico',
  fighting: 'Lucha',
  steel: 'Acero',
};
const stats: Record<string, string> = {
  hp: 'PS',
  attack: 'Ataque',
  defense: 'Defensa',
  'special-attack': 'Ataque especial',
  'special-defense': 'Defensa especial',
  speed: 'Velocidad',
};

/** Packaged PokéAPI snapshot keeps the starter available during API outages. */
export async function pokemonQuestions(): Promise<StarterQuestion[]> {
  const entries = JSON.parse(
    await readFile(resolve(POKEMON_ASSETS, 'catalog.json'), 'utf8'),
  ) as PokemonEntry[];
  return entries.flatMap((pokemon, index) => {
    const name = pokemon.name[0].toUpperCase() + pokemon.name.slice(1);
    const ordered = Object.entries(pokemon.stats).sort((a, b) => b[1] - a[1]);
    const [strongest, value] = ordered[0];
    const weaker = ordered
      .filter(([, amount]) => amount < value)
      .slice(0, 3)
      .map(([key]) => stats[key]);
    const correctIndex = index % 4;
    weaker.splice(correctIndex, 0, stats[strongest]);
    const image = pokemon.name + '.png';
    const first: StarterQuestion = {
      text: `Entre estas opciones, ¿cuál es la estadística base más alta de ${name}?`,
      options: weaker,
      correctIndex,
      image,
    };
    if (index % 3 === 0) {
      const total = Object.values(pokemon.stats).reduce(
        (sum, amount) => sum + amount,
        0,
      );
      const statement = index % 2 === 0;
      return [
        first,
        {
          text: `La suma de las seis estadísticas base de ${name} ${statement ? 'supera' : 'no supera'} los ${total - 10} puntos.`,
          options: ['Verdadero', 'Falso'],
          correctIndex: statement ? 0 : 1,
          image,
          binary: true,
        },
      ];
    }
    if (index % 3 === 1) {
      const correct = pokemon.types.map((type) => types[type]).join(' / ');
      const choices = [
        'Fuego / Dragón',
        'Agua / Dragón',
        'Planta / Veneno',
        'Fantasma / Veneno',
        'Lucha / Acero',
      ]
        .filter((type) => type !== correct)
        .slice(0, 4);
      const position = index % 5;
      choices.splice(position, 0, correct);
      return [
        first,
        {
          text: `¿Qué combinación de tipos tiene ${name} en su forma estándar?`,
          options: choices,
          correctIndex: position,
          image,
        },
      ];
    }
    const reference = entries[(index + 1) % entries.length];
    const heavier = pokemon.weight > reference.weight;
    return [
      first,
      {
        text: `${name} pesa más que ${reference.name[0].toUpperCase() + reference.name.slice(1)} en sus formas estándar.`,
        options: ['Verdadero', 'Falso'],
        correctIndex: heavier ? 0 : 1,
        image,
        binary: true,
      },
    ];
  });
}
