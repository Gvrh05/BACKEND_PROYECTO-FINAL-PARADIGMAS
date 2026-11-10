import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Punto 3 documentation contracts', () => {
  const document = JSON.parse(
    readFileSync(resolve(__dirname, '../../../docs/openapi.json'), 'utf8'),
  );

  it('documents six protected routes, response codes and only the agreed WS events', () => {
    const routes = [
      ['/game-sessions', 'post', '201'],
      ['/game-sessions/available-quizzes', 'get', '200'],
      ['/game-sessions/{roomCode}', 'get', '200'],
      ['/game-sessions/{roomCode}/participants', 'get', '200'],
      ['/game-sessions/{roomCode}/join', 'post', '201'],
      ['/game-sessions/{roomCode}/start', 'post', '200'],
    ];
    for (const [path, verb, success] of routes) {
      expect(document.paths[path][verb].security).toEqual([{ BearerAuth: [] }]);
      expect(document.paths[path][verb].responses[success]).toBeDefined();
      expect(document.paths[path][verb].responses['401']).toBeDefined();
    }
    expect(Object.keys(document['x-websocket'].events).sort()).toEqual(
      [
        'error',
        'join-session',
        'participants-updated',
        'session-started',
        'session-state',
        'start-session',
      ].sort(),
    );
  });

  it('resolves all local JSON references and describes six-digit string codes', () => {
    function walk(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (key === '$ref') {
          expect(typeof item).toBe('string');
          expect(String(item).startsWith('#/')).toBe(true);
          const target = String(item)
            .slice(2)
            .split('/')
            .reduce((node, part) => node?.[part], document);
          expect(target).toBeDefined();
        } else walk(item);
      }
    }
    walk(document);
    const code = document.components.schemas.RoomCode;
    expect(code.type).toBe('string');
    expect('123456').toMatch(new RegExp(code.pattern));
    expect('12345').not.toMatch(new RegExp(code.pattern));
  });

  it('preserves the original quizzes/results documentation and does not add global authentication to it', () => {
    expect(document.security).toBeUndefined();
    expect(document.paths['/quizzes']).toEqual({
      get: {
        summary: 'Listar cuestionarios',
        tags: ['Quizzes'],
        responses: {
          '200': { description: 'Lista de cuestionarios obtenida con éxito' },
        },
      },
      post: {
        summary: 'Crear un nuevo cuestionario',
        tags: ['Quizzes'],
        responses: { '201': { description: 'Cuestionario creado con éxito' } },
      },
    });
    expect(document.paths['/results/{pin}']).toEqual({
      get: {
        summary: 'Obtener resultados de una sesión por PIN',
        tags: ['Results'],
        parameters: [
          {
            name: 'pin',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'Resultados de la sesión' } },
      },
    });
  });
});
