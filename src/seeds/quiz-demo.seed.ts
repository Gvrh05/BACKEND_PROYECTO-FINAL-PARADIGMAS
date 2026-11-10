import 'dotenv/config';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DataSource } from 'typeorm';
import sharp from 'sharp';
import { Question } from '../modules/quizzes/entities/question.entity';
import { QuestionOption } from '../modules/quizzes/entities/question-option.entity';
import { Quiz } from '../modules/quizzes/entities/quiz.entity';
import { getDatabaseOptions } from '../shared/database/database.config';

const quizTitle = 'Evaluación de Cultura General';
interface DemoQuestion {
  questionText: string;
  options: [string, string, string, string];
  correct: number;
}

const questions: DemoQuestion[] = [
  {
    questionText: '¿Cuál es la capital de Francia?',
    options: ['París', 'Roma', 'Lisboa', 'Bruselas'],
    correct: 0,
  },
  {
    questionText: '¿Cuál es el planeta más grande del sistema solar?',
    options: ['Saturno', 'Júpiter', 'Neptuno', 'Urano'],
    correct: 1,
  },
  {
    questionText: '¿Cuál es la moneda oficial de Japón?',
    options: ['Won', 'Yuan', 'Yen', 'Baht'],
    correct: 2,
  },
  {
    questionText: '¿Quién escribió Don Quijote de la Mancha?',
    options: [
      'Federico García Lorca',
      'Miguel de Cervantes',
      'Lope de Vega',
      'Francisco de Quevedo',
    ],
    correct: 1,
  },
  {
    questionText: '¿Cuál es la fórmula química del agua?',
    options: ['CO₂', 'O₂', 'NaCl', 'H₂O'],
    correct: 3,
  },
  {
    questionText: '¿Qué planeta es conocido como el planeta rojo?',
    options: ['Venus', 'Marte', 'Mercurio', 'Saturno'],
    correct: 1,
  },
  {
    questionText: '¿Cuál es la montaña más alta sobre el nivel del mar?',
    options: ['K2', 'Aconcagua', 'Everest', 'Kilimanjaro'],
    correct: 2,
  },
  {
    questionText: '¿En qué continente se encuentra el desierto del Sahara?',
    options: ['Asia', 'África', 'Oceanía', 'América'],
    correct: 1,
  },
  {
    questionText: 'Aproximadamente, ¿a qué velocidad viaja la luz en el vacío?',
    options: ['30 000 km/s', '150 000 km/s', '300 000 km/s', '1 000 000 km/s'],
    correct: 2,
  },
  {
    questionText: '¿Cuántos huesos tiene aproximadamente un adulto?',
    options: ['106', '206', '306', '406'],
    correct: 1,
  },
];

interface AuthResponse {
  accessToken: string;
  user: { id: string; username: string; role: string };
}

async function ensureDemoUser(): Promise<AuthResponse['user']> {
  const baseUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001/auth';
  const username = process.env.DEMO_USER_USERNAME || 'profesor_test';
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password)
    throw new Error(
      'DEMO_USER_PASSWORD es obligatorio para crear el usuario demo',
    );

  const register = await fetch(`${baseUrl.replace(/\/$/, '')}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role: 'PROFESOR' }),
  });
  if (register.ok) {
    const result = (await register.json()) as AuthResponse;
    return result.user;
  }
  if (register.status !== 409) {
    throw new Error(
      `Auth no pudo crear el usuario demo (HTTP ${register.status})`,
    );
  }

  const login = await fetch(`${baseUrl.replace(/\/$/, '')}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) {
    throw new Error(
      `La cuenta demo ya existe pero no se pudo autenticar (HTTP ${login.status})`,
    );
  }
  return ((await login.json()) as AuthResponse).user;
}

async function copySeedImages(): Promise<number[]> {
  const seedDirectory = resolve(
    process.env.SEED_IMAGES_DIR || './public/seeds',
  );
  const questionDirectory = join(
    resolve(process.env.UPLOADS_DEST || './uploads'),
    'questions',
  );
  await mkdir(questionDirectory, { recursive: true });

  const sizes: number[] = [];
  for (let index = 1; index <= questions.length; index++) {
    const filename = `q${index}.png`;
    const source = join(seedDirectory, filename);
    const destination = join(questionDirectory, filename);
    const image = sharp(source, { limitInputPixels: 25000000 });
    const metadata = await image.metadata();
    if (metadata.format !== 'png') {
      throw new Error(`La imagen seed ${filename} no es un PNG válido`);
    }
    await image.stats();
    const imageSize = (await stat(source)).size;
    const maxSize = Number(process.env.MAX_FILE_SIZE ?? 5242880);
    if (imageSize <= 0 || imageSize > maxSize) {
      throw new Error(`${filename} debe pesar entre 1 byte y ${maxSize} bytes`);
    }
    await copyFile(source, destination);
    sizes.push(imageSize);
  }
  return sizes;
}

async function seed(): Promise<void> {
  if (questions.length !== 10)
    throw new Error('El quiz demo debe contener exactamente 10 preguntas');
  const imageSizes = await copySeedImages();
  const user = await ensureDemoUser();
  const dataSource = new DataSource(getDatabaseOptions());
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await dataSource.transaction(async (manager) => {
      const quizzes = manager.getRepository(Quiz);
      const existing = await quizzes.findOneBy({
        authorId: user.id,
        title: quizTitle,
      });
      if (existing) {
        const count = await manager
          .getRepository(Question)
          .countBy({ quizId: existing.id });
        if (count !== questions.length) {
          throw new Error(
            `Ya existe «${quizTitle}» con ${count} preguntas; no se sobrescribieron datos existentes`,
          );
        }
        if (!existing.isDemo) {
          await quizzes.update({ id: existing.id }, { isDemo: true });
        }
        console.log(`Seed ya aplicado: ${quizTitle} (${existing.id})`);
        return;
      }

      const quiz = await quizzes.save(
        quizzes.create({
          authorId: user.id,
          title: quizTitle,
          description:
            'Diez preguntas de cultura general para probar la autoría y las imágenes.',
          coverImageUrl: null,
          isDemo: true,
        }),
      );

      for (const [index, definition] of questions.entries()) {
        const question = await manager.getRepository(Question).save(
          manager.getRepository(Question).create({
            quizId: quiz.id,
            questionText: definition.questionText,
            timeLimitSeconds: 20,
            points: 1000,
            imageStorageKey: `q${index + 1}.png`,
            imageUrl: `/uploads/questions/q${index + 1}.png`,
            imageMimeType: 'image/png',
            imageSize: imageSizes[index],
          }),
        );
        await manager.getRepository(QuestionOption).save(
          definition.options.map((text, position) =>
            manager.getRepository(QuestionOption).create({
              questionId: question.id,
              text,
              position,
              isCorrect: position === definition.correct,
            }),
          ),
        );
      }
    });
    console.log(
      `Seed creado: ${quizTitle} con 10 preguntas e imágenes locales.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Falló el seed del quiz demo',
  );
  process.exitCode = 1;
});
