import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { StarterQuestion } from './pokemon-catalog';

export const DEFAULT_DRAGONBALL_QUIZ_ID =
  'f93020de-c49c-47e3-ae78-a8f624271028';
export const DRAGONBALL_ASSETS = resolve(
  __dirname,
  '../../../../public/seeds/dragonball',
);

interface Character {
  id: number;
  name: string;
}

const storyQuestions = [
  {
    text: 'En Dragon Ball Super: Broly, ¿por qué los padres de Goku lo enviaron a la Tierra?',
    options: [
      'Para sobrevivir a la destrucción de su planeta',
      'Para participar en el Torneo del Poder',
      'Para entrenar con el Maestro Roshi',
      'Para reunir las Superesferas del Dragón',
      'Para buscar a su hermano Raditz',
    ],
  },
  {
    text: '¿Qué cambio de lealtad describe la trayectoria de Vegeta tras su etapa inicial como antagonista?',
    options: [
      'Se rebela contra Freezer y se convierte en aliado de los Guerreros Z',
      'Abandona los Guerreros Z para dirigir las Fuerzas Ginyu',
      'Deja a Freezer para servir al Ejército del Listón Rojo',
      'Se convierte en el creador de los androides',
    ],
  },
  {
    text: '¿Qué discípulo de Piccolo acaba siendo para él como un hijo?',
    options: ['Son Gohan', 'Trunks del futuro', 'Son Goten', 'Krilin'],
  },
  {
    text: '¿Qué parentesco tiene Tights con Bulma?',
    options: [
      'Es su hermana mayor',
      'Es su madre',
      'Es su hija',
      'Es su sobrina',
    ],
  },
  {
    text: '¿Qué transformación dorada alcanza Freezer tras entrenar para superar a Goku?',
    options: [
      'Golden Freezer',
      'Super Saiyano',
      'Piccolo Orange',
      'Super Saiyano Blue',
    ],
  },
  {
    text: '¿Qué le ocurre a Zarbon cuando utiliza su transformación para aumentar su poder?',
    options: [
      'Adquiere una apariencia monstruosa',
      'Se convierte en un saiyano',
      'Se fusiona con Dodoria',
      'Se transforma en un androide',
      'Adopta la forma de Freezer',
    ],
  },
  {
    text: '¿Qué combinación describe a Dodoria durante la saga de Namek?',
    options: [
      'Ejército de Freezer; conocido por su brutalidad',
      'Guerreros Z; discípulo de Piccolo',
      'Independiente; creado por el Dr. Gero',
      'Ejército de Freezer; líder de las Fuerzas Ginyu',
    ],
  },
  {
    text: '¿Qué papel ocupa Ginyu dentro de la élite de mercenarios del Ejército de Freezer?',
    options: [
      'Dirige las Fuerzas Especiales Ginyu',
      'Es el creador de Célula',
      'Es el príncipe de los saiyanos',
      'Es el padre de Freezer',
    ],
  },
  {
    text: '¿Quién creó al bioandroide Célula?',
    options: [
      'Fue creado por la computadora del Dr. Gero',
      'Es una transformación de Freezer',
      'Es un namekiano creado por Piccolo',
      'Fue construido por el Dr. Brief',
      'Es un androide diseñado por Bulma',
    ],
  },
  {
    text: '¿Qué relación familiar de Gohan es correcta?',
    options: [
      'Es esposo de Videl y padre de Pan',
      'Es esposo de Bulma y padre de Trunks',
      'Es hermano mayor de Goku y padre de Goten',
      'Es hijo de Vegeta y hermano de Bra',
    ],
  },
];

const additionalQuestions: Omit<StarterQuestion, 'image' | 'correctIndex'>[] = [
  {
    text: '¿Cuál es el nombre saiyano de Goku?',
    options: ['Kakarot', 'Bardock', 'Raditz', 'Nappa', 'Vegeta'],
  },
  {
    text: 'Vegeta pertenece a la familia real de los saiyanos.',
    options: ['Verdadero', 'Falso'],
    binary: true,
  },
  {
    text: 'Piccolo fue enemigo de Goku antes de convertirse en su aliado.',
    options: ['Verdadero', 'Falso'],
    binary: true,
  },
  {
    text: '¿Quiénes son los padres de Bulma?',
    options: [
      'El Dr. Brief y Panchy',
      'Goku y Chi-Chi',
      'Vegeta y Videl',
      'El Dr. Gero y Bulma del futuro',
    ],
  },
  {
    text: 'Freezer lidera el ejército en el que sirven Zarbon y Dodoria.',
    options: ['Verdadero', 'Falso'],
    binary: true,
  },
  {
    text: 'Zarbon forma parte de los Guerreros Z durante la saga de Namek.',
    options: ['Falso', 'Verdadero'],
    binary: true,
  },
  {
    text: 'Dodoria es el líder de las Fuerzas Especiales Ginyu.',
    options: ['Falso', 'Verdadero'],
    binary: true,
  },
  {
    text: 'Las Fuerzas Especiales Ginyu reciben su nombre de su líder.',
    options: ['Verdadero', 'Falso'],
    binary: true,
  },
  {
    text: '¿Qué ejército destruido por Goku está relacionado con la venganza del Dr. Gero?',
    options: [
      'El Ejército del Listón Rojo',
      'El Ejército de Freezer',
      'Las Fuerzas Especiales Ginyu',
      'Los Guerreros Z',
      'La patrulla galáctica',
    ],
  },
  {
    text: '¿Qué parentesco tiene Goten con Gohan?',
    options: [
      'Es su hermano menor',
      'Es su hijo',
      'Es su padre',
      'Es su hermano mayor',
    ],
  },
];

function arrangeQuestion(
  question: Omit<StarterQuestion, 'image' | 'correctIndex'>,
  index: number,
  image: string,
): StarterQuestion {
  const options = [...question.options];
  // Binary choices keep their familiar order. Their first supplied answer is correct.
  if (question.binary) {
    return {
      ...question,
      image,
      options: ['Verdadero', 'Falso'],
      correctIndex: options[0] === 'Verdadero' ? 0 : 1,
    };
  }
  const correctIndex = index % options.length;
  const correct = options.shift()!;
  options.splice(correctIndex, 0, correct);
  return { ...question, image, options, correctIndex };
}

export async function dragonballQuestions(): Promise<StarterQuestion[]> {
  const characters = JSON.parse(
    await readFile(resolve(DRAGONBALL_ASSETS, 'catalog.json'), 'utf8'),
  ) as Character[];
  return characters.flatMap((character, index) => {
    const image = character.id + '.png';
    return [
      arrangeQuestion(storyQuestions[index], index, image),
      arrangeQuestion(additionalQuestions[index], index + 1, image),
    ];
  });
}
