import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TokenVerifier } from './token-verifier.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [TokenVerifier, JwtAuthGuard],
  exports: [TokenVerifier, JwtAuthGuard],
})
export class AuthModule {}
