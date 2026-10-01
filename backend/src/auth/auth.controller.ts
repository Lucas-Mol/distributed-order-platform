import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthThrottle } from '../common/throttling/throttling.js';
import { AuthService } from './auth.service.js';
import { CredentialsDto } from './dto/credentials.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @AuthThrottle()
  register(@Body() dto: CredentialsDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: CredentialsDto) {
    return this.auth.login(dto);
  }
}
