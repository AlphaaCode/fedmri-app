import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private redis: Redis;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    if (dto.role === 'DOCTOR') {
      if (!dto.hospitalId) {
        throw new BadRequestException('Hospital ID required for doctors');
      }

      const hospital = await this.prisma.hospital.findUnique({
        where: { id: dto.hospitalId },
      });

      if (!hospital) {
        throw new BadRequestException('Hospital not found');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role as any,
        hospitalId: dto.hospitalId || null,
      },
    });

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.role, user.hospitalId);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hospitalId: user.hospitalId,
        onboardingDone: user.onboardingDone ?? false,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.role, user.hospitalId);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hospitalId: user.hospitalId,
        onboardingDone: user.onboardingDone ?? false,
      },
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const storedToken = await this.redis.get(`refresh:${userId}`);

    if (!storedToken || storedToken !== refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { accessToken, refreshToken: newRefreshToken } = await this.generateTokens(user.id, user.email, user.role, user.hospitalId);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: string) {
    await this.redis.del(`refresh:${userId}`);
    return { message: 'Logged out' };
  }

  private async generateTokens(userId: string, email: string, role: string, hospitalId: string | null) {
    const payload = {
      sub: userId,
      email,
      role,
      ...(hospitalId && { hospitalId }),
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: (process.env.JWT_ACCESS_EXPIRES || '15m') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES || '7d') as any,
    });

    await this.redis.setex(`refresh:${userId}`, 7 * 24 * 60 * 60, refreshToken);

    return { accessToken, refreshToken };
  }
}
