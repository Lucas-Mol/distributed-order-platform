import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { Auth } from '../auth/auth.decorator.js';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role } from '../generated/prisma/client.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @Auth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get()
  @Auth(Role.ADMIN)
  findAll(@Query() query: PaginationQueryDto) {
    return this.users.findAll(query);
  }

  @Patch(':id/role')
  @Auth(Role.ADMIN)
  updateRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.users.updateRole(actor.id, id, dto.role);
  }
}
