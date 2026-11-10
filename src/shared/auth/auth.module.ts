import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TokenVerifier } from './token-verifier.service';
import { GameSessionAuthGuard } from './game-session-auth.guard';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [TokenVerifier, GameSessionAuthGuard],
  exports: [TokenVerifier, GameSessionAuthGuard],
})
export class AuthModule {}
