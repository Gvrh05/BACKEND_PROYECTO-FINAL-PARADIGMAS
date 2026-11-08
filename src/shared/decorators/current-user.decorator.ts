import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export class AuthenticatedUser {
  userId: string;
  username: string;
  role: 'PROFESOR' | 'ESTUDIANTE';
  [key: string]: any;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
