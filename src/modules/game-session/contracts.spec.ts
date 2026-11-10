import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ContractDocument {
  security?: unknown;
  paths: Record<
    string,
    Record<string, { security?: unknown; responses: Record<string, unknown> }>
  >;
  components: {
    schemas: { RoomCode: { type: string; pattern: string } };
    securitySchemes: Record<string, unknown>;
  };
  'x-websocket': { events: Record<string, unknown> };
}

describe('Punto 3 documentation contracts', () => {
  const document = JSON.parse(
    readFileSync(resolve(__dirname, '../../../docs/openapi.json'), 'utf8'),
  ) as ContractDocument;

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
        'answer-accepted',
        'game-finished',
        'next-question',
        'question-closed',
        'question-opened',
        'round-result',
        'submit-answer',
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
            .reduce<unknown>(
              (node, part) =>
                node && typeof node === 'object'
                  ? (node as Record<string, unknown>)[
                      part.replace(/~1/g, '/').replace(/~0/g, '~')
                    ]
                  : undefined,
              document,
            );
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

  it('preserves the incoming authoring, health, uploads and results contracts alongside Punto 3', () => {
    expect(document.security).toEqual([{ bearerAuth: [] }]);
    for (const route of [
      '/quizzes',
      '/quizzes/{quizId}',
      '/quizzes/{quizId}/questions',
      '/health',
      '/uploads/questions/{filename}',
      '/results/{pin}',
    ]) {
      expect(document.paths[route]).toBeDefined();
    }
    expect(document.components.securitySchemes.bearerAuth).toBeDefined();
    expect(document.components.securitySchemes.BearerAuth).toBeDefined();
  });
});
