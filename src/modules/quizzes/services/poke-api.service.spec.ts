import { ServiceUnavailableException } from '@nestjs/common';
import { PokeApiService } from './poke-api.service';

describe('PokeApiService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reads the primary type and caches the generated facts', async () => {
    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        name: url.split('/').filter(Boolean).at(-1),
        types: [{ slot: 1, type: { name: 'electric' } }],
      }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new PokeApiService();

    await expect(service.getStarterFacts()).resolves.toHaveLength(10);
    await expect(service.getStarterFacts()).resolves.toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('does not create a partial result when PokéAPI fails', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(new PokeApiService().getStarterFacts()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
