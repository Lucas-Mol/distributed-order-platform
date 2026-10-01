import { Role } from '../generated/prisma/client.js';

const RANK: Record<Role, number> = {
  [Role.CUSTOMER]: 0,
  [Role.MANAGER]: 1,
  [Role.ADMIN]: 2,
};

export function hasRole(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}
