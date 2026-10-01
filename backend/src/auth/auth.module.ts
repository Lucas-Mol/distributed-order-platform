import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { appConfig } from '../config/app.config.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

type ExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

function toExpiresIn(value: string): ExpiresIn {
  return /^\d+$/.test(value) ? Number(value) : (value as ExpiresIn);
}

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>): JwtModuleOptions => ({
        secret: config.jwt.secret,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: toExpiresIn(config.jwt.expiresIn),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
