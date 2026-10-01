import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService.updateRole', () => {
  const prisma = { user: { update: vi.fn() } };
  let service: UsersService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('updates another user without exposing the password hash', async () => {
    prisma.user.update.mockResolvedValue({ id: 'u2', role: Role.MANAGER });
    await service.updateRole('admin', 'u2', Role.MANAGER);

    const args = prisma.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'u2' });
    expect(args.data).toEqual({ role: Role.MANAGER });
    expect(args.select).not.toHaveProperty('passwordHash');
  });

  it('refuses to change the caller own role', () => {
    expect(() => service.updateRole('admin', 'admin', Role.CUSTOMER)).toThrow(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
