import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const secret = 'guard-test-secret';
  let previous: string | undefined;
  let reflector: Reflector;
  beforeEach(() => {
    previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    reflector = new Reflector();
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  });

  function context(authorization?: string) {
    const request: {
      headers: { authorization?: string };
      user?: { userId: string };
    } = { headers: { authorization } };
    const execution = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, execution };
  }

  it('requires an explicitly configured shared secret', () => {
    delete process.env.JWT_SECRET;
    expect(() => new JwtAuthGuard(reflector)).toThrow(
      'JWT_SECRET es obligatorio',
    );
  });

  it.each([undefined, 'Basic abc', 'Bearer ', 'Bearer invalid'])(
    'rejects a missing/malformed token: %s',
    (header) => {
      expect(() =>
        new JwtAuthGuard(reflector).canActivate(context(header).execution),
      ).toThrow(UnauthorizedException);
    },
  );

  it.each([
    jwt.sign({ sub: randomUUID() }, secret, { expiresIn: -1 }),
    jwt.sign({ sub: randomUUID() }, 'wrong-secret', { expiresIn: '1h' }),
    jwt.sign({ sub: randomUUID() }, secret, { algorithm: 'HS384' }),
    jwt.sign({}, secret),
    jwt.sign({ sub: 'not-a-uuid' }, secret),
  ])(
    'rejects an expired token, incorrect signature/algorithm or invalid identity',
    (token) => {
      expect(() =>
        new JwtAuthGuard(reflector).canActivate(
          context(`Bearer ${token}`).execution,
        ),
      ).toThrow(UnauthorizedException);
    },
  );

  it('rejects a validly signed token issued for another audience', () => {
    const token = jwt.sign({ sub: randomUUID() }, secret, {
      expiresIn: '1h',
      audience: 'another-service',
    });
    expect(() =>
      new JwtAuthGuard(reflector).canActivate(
        context(`Bearer ${token}`).execution,
      ),
    ).toThrow(UnauthorizedException);
  });

  it('normalizes userId after payload fields, using only the verified sub', () => {
    const sub = randomUUID();
    const token = jwt.sign(
      { sub, userId: randomUUID(), username: 'creator', role: 'ESTUDIANTE' },
      secret,
      { expiresIn: '1h', audience: 'kahoot-api' },
    );
    const { request, execution } = context(`Bearer ${token}`);
    expect(new JwtAuthGuard(reflector).canActivate(execution)).toBe(true);
    expect(request.user?.userId).toBe(sub);
  });

  it('still respects explicitly public handlers', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(new JwtAuthGuard(reflector).canActivate(context().execution)).toBe(
      true,
    );
  });
});
