import { BadRequestException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { isUUID } from 'class-validator';
import type { AuthenticatedUser } from '../../../shared/decorators/current-user.decorator';
import { QuestionsService } from '../services/questions.service';

@Injectable()
export class QuestionOwnerGuard implements CanActivate {
  constructor(private readonly questions: QuestionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    const { quizId, questionId } = request.params;
    if (
      typeof quizId !== 'string' ||
      typeof questionId !== 'string' ||
      !isUUID(quizId) ||
      !isUUID(questionId)
    ) {
      throw new BadRequestException('Los identificadores deben ser UUID');
    }
    await this.questions.loadOwned(request.user.userId, quizId, questionId);
    return true;
  }
}
