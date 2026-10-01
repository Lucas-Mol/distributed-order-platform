import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { type PublicUser, UsersService } from '../users/users.service.js';
import type { CredentialsDto } from './dto/credentials.dto.js';
import type { JwtPayload } from './jwt.strategy.js';

export interface AccessToken {
  accessToken: string;
  tokenType: 'Bearer';
}

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash('timing-equalizer-password');

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register({ email, password }: CredentialsDto): Promise<PublicUser> {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    return this.users.create(email, passwordHash);
  }

  async login({ email, password }: CredentialsDto): Promise<AccessToken> {
    const user = await this.users.findByEmail(email);
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const valid = await argon2.verify(hash, password);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
    };
  }
}
