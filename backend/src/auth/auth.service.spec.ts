import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  const users = { findByEmail: vi.fn(), create: vi.fn() };
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed-token') };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('stores an argon2id hash, never the plain password', async () => {
    users.create.mockResolvedValue({ id: 'u1', email: 'a@example.com' });

    await service.register({
      email: 'a@example.com',
      password: 'supersecret1',
    });

    const hash = users.create.mock.calls[0][1] as string;
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(hash, 'supersecret1')).toBe(true);
  });

  it('issues a token for valid credentials', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      passwordHash: await argon2.hash('supersecret1'),
    });

    await expect(
      service.login({ email: 'a@example.com', password: 'supersecret1' }),
    ).resolves.toEqual({ accessToken: 'signed-token', tokenType: 'Bearer' });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'u1',
      email: 'a@example.com',
    });
  });

  it('rejects a wrong password', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      passwordHash: await argon2.hash('supersecret1'),
    });
    await expect(
      service.login({ email: 'a@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown e-mail with the same error', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever12' }),
    ).rejects.toThrow('Invalid credentials');
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
