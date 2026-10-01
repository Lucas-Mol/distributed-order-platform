import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Role, User } from '../generated/prisma/client.js';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';

export type PublicUser = Pick<User, 'id' | 'email' | 'role' | 'createdAt'>;

const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  create(email: string, passwordHash: string): Promise<PublicUser> {
    return this.prisma.user.create({
      data: { email, passwordHash },
      select: publicUserSelect,
    });
  }

  findAll({ limit, offset }: PaginationQueryDto): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
    });
  }

  updateRole(actorId: string, userId: string, role: Role): Promise<PublicUser> {
    if (actorId === userId) {
      throw new BadRequestException('You cannot change your own role');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: publicUserSelect,
    });
  }
}
