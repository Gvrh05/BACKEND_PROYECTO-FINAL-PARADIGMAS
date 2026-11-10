import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenVerifier } from './token-verifier.service';
import { GameSessionAuthGuard as JwtAuthGuard } from './game-session-auth.guard';

describe('TokenVerifier / JwtAuthGuard', () => {
  const settings = {
    JWT_SECRET: 'unit-test-only-key',
    JWT_ISSUER: 'unit-test-issuer',
    JWT_AUDIENCE: 'unit-test-audience',
  };
  let jwt: JwtService;
  let verifier: TokenVerifier;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = new JwtService();
    verifier = new TokenVerifier(jwt, new ConfigService(settings));
    guard = new JwtAuthGuard(verifier);
  });

  function token(payload: Record<string, unknown> = { sub: 'host' }) {
    return jwt.sign(payload, {
      secret: settings.JWT_SECRET,
      algorithm: 'HS256',
      issuer: settings.JWT_ISSUER,
      audience: settings.JWT_AUDIENCE,
      ...(payload.exp === undefined && { expiresIn: 300 }),
    });
  }

  function context(authorization?: string) {
    const request = { headers: { authorization }, user: undefined as unknown };
    const execution = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, execution };
  }

  it('verifies a valid token and assigns only verified public claims in HTTP', async () => {
    const signed = token({
      sub: 'host',
      email: 'demo@example.test',
      role: 'host',
      name: 'Demo',
      ignored: 'no',
    });
    const { execution, request } = context(`Bearer ${signed}`);
    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(request.user).toEqual({
      sub: 'host',
      email: 'demo@example.test',
      role: 'host',
    });
    await expect(verifier.verify(signed)).resolves.toEqual({
      sub: 'host',
      email: 'demo@example.test',
      role: 'host',
      name: 'Demo',
    });
  });

  it.each([undefined, '', 'Basic abc', 'Bearer ', 'Bearer abc extra'])(
    'rejects an absent/malformed Bearer header: %s',
    async (header) => {
      const { execution, request } = context(header);
      await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    },
  );

  it('rejects invalid signatures and malformed JWTs', async () => {
    const signed = jwt.sign({ sub: 'host' }, { secret: 'different-test-key' });
    await expect(verifier.verify(signed)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects expired tokens', async () => {
    await expect(
      verifier.verify(token({ sub: 'host', exp: 1 })),
    ).rejects.toThrow();
  });

  it.each([{}, { sub: '' }, { sub: '  ' }, { sub: 42 }])(
    'rejects a missing or invalid subject: %j',
    async (payload) => {
      await expect(verifier.verify(token(payload))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it.each([
    { issuer: 'wrong-issuer', audience: settings.JWT_AUDIENCE },
    { issuer: settings.JWT_ISSUER, audience: 'wrong-audience' },
  ])('rejects issuer/audience mismatch: %j', async (claims) => {
    const signed = jwt.sign(
      { sub: 'host' },
      { secret: settings.JWT_SECRET, ...claims },
    );
    await expect(verifier.verify(signed)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects algorithms other than HS256', async () => {
    const signed = jwt.sign(
      { sub: 'host' },
      { secret: settings.JWT_SECRET, algorithm: 'HS384' },
    );
    await expect(verifier.verify(signed)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails closed without a configured secret', async () => {
    const missing = new TokenVerifier(jwt, new ConfigService({}));
    await expect(missing.verify(token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const blank = new TokenVerifier(
      jwt,
      new ConfigService({ JWT_SECRET: ' ' }),
    );
    await expect(blank.verify(token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
