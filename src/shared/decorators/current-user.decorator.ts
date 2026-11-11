import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export class AuthenticatedUser {
  userId: string;
  username: string;
  role: 'PROFESOR' | 'MASTER';
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
