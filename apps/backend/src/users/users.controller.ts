import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    return req.user;
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@Request() req: any, @Body() data: any) {
    return this.usersService.updateMe(req.user.id, data);
  }
}
