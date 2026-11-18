import { corsOrigins } from './cors';
describe('REST and WS CORS origins', () => {
  it('parses exact Netlify and localhost origins', () => {
    expect(
      corsOrigins(
        'http://localhost:5173, https://project-deploy-985df3.netlify.app',
      ),
    ).toEqual([
      'http://localhost:5173',
      'https://project-deploy-985df3.netlify.app',
    ]);
  });
  it.each([
    '*',
    'https://example.com/',
    'https://user:secret@example.com',
    'https://example.com/path',
  ])('rejects unsafe or ambiguous origins: %s', (origin) => {
    expect(() => corsOrigins(origin)).toThrow();
  });
});
