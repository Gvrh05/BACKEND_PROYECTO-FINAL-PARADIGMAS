import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenVerifier } from '../auth/token-verifier.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('Global account guard', () => {
  const verifier = { verify: jest.fn() };
  const reflector = new Reflector();
  const guard = new JwtAuthGuard(
    reflector,
    verifier as unknown as TokenVerifier,
  );
  function context(authorization?: string) {
    const request = { headers: { authorization }, user: undefined as unknown };
    const execution = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, execution };
  }
  afterEach(() => jest.restoreAllMocks());
  it.each([undefined, '', 'Basic abc', 'Bearer ', 'Bearer abc extra'])(
    'rejects malformed header %s',
    async (header) => {
      await expect(
        guard.canActivate(context(header).execution),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
  it('uses only verified identity and delegates status checking', async () => {
    verifier.verify.mockResolvedValue({
      sub: 'server-id',
      name: 'Teacher',
      role: 'MASTER',
    });
    const { request, execution } = context('Bearer signed');
    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      userId: 'server-id',
      username: 'Teacher',
      role: 'MASTER',
    });
    verifier.verify.mockRejectedValueOnce(new UnauthorizedException());
    await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('permits explicitly public endpoints', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(context().execution)).resolves.toBe(true);
  });
});
