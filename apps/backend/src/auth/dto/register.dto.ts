import { IsEmail, IsString, MinLength, IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase())
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  name: string;

  @IsEnum(['DOCTOR', 'PATIENT', 'ADMIN'])
  role: 'DOCTOR' | 'PATIENT' | 'ADMIN';

  @IsOptional()
  @IsString()
  @ValidateIf((obj) => obj.role === 'DOCTOR')
  hospitalId?: string;
}
