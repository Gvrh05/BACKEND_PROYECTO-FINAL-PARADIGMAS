import { randomUUID } from 'node:crypto';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenVerifier } from './token-verifier.service';

describe('Account verification shared by HTTP and WS', () => {
  const sub = randomUUID();
  const jwt = new JwtService();
  const secret = 'test-secret';
  const verifier = new TokenVerifier(
    jwt,
    new ConfigService({ JWT_SECRET: secret }),
  );
  const profile = {
    id: sub,
    username: 'Teacher',
    role: 'PROFESOR',
    active: true,
    isSystem: false,
    credentialVersion: 2,
  };
  const claims = {
    sub,
    role: 'PROFESOR',
    purpose: 'account',
    credentialVersion: 2,
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  const sign = (overrides = {}) =>
    jwt.sign({ ...claims, ...overrides }, { secret, audience: 'kahoot-api' });
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(profile))),
      );
  });
  afterEach(() => jest.restoreAllMocks());
  it('checks the live account every time and returns server profile', async () => {
    await expect(verifier.verify(sign())).resolves.toEqual({
      sub,
      role: 'PROFESOR',
      name: 'Teacher',
    });
    await verifier.verify(sign());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/auth/session/validate',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });
  it.each([
    { sub: 'legacy' },
    { sub: '' },
    { role: 'ESTUDIANTE' },
    { role: 'admin' },
    { purpose: 'guest' },
    { credentialVersion: -1 },
    { credentialVersion: '2' },
    { exp: 1 },
  ])('rejects invalid claims %j before contacting Auth', async (overrides) => {
    await expect(verifier.verify(sign(overrides))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires expiry and rejects legacy claims, wrong algorithms, signatures and audience', async () => {
    const { exp: _exp, ...withoutExpiry } = claims;
    void _exp;
    for (const token of [
      jwt.sign(withoutExpiry, { secret, audience: 'kahoot-api' }),
      jwt.sign(claims, { secret, audience: 'other' }),
      jwt.sign(claims, { secret, algorithm: 'HS384', audience: 'kahoot-api' }),
      jwt.sign(claims, { secret: 'wrong', audience: 'kahoot-api' }),
      'invalid',
    ]) {
      await expect(verifier.verify(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { active: false },
    { credentialVersion: 3 },
    { role: 'MASTER' },
    { id: randomUUID() },
  ])('rejects stale/inactive accounts %j', async (overrides) => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...profile, ...overrides })),
    );
    await expect(verifier.verify(sign())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('fails closed on outage and invalid upstream data', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(verifier.verify(sign())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(verifier.verify(sign())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    fetchMock.mockResolvedValueOnce(new Response('not json'));
    await expect(verifier.verify(sign())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('accepts MASTER and rejects revoked tokens', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...profile, role: 'MASTER' })),
    );
    await expect(
      verifier.verify(sign({ role: 'MASTER' })),
    ).resolves.toMatchObject({ role: 'MASTER' });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(verifier.verify(sign())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
