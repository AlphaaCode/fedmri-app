import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hospitalId: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Clean up test users from previous runs
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'test.doctor@fedmri.local',
            'test.patient@fedmri.local',
            'invalid.doctor@fedmri.local',
          ],
        },
      },
    });

    // Get first hospital for testing
    const hospital = await prisma.hospital.findFirst();
    if (!hospital) {
      throw new Error('No hospital found in database');
    }
    hospitalId = hospital.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a DOCTOR with valid hospitalId and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test.doctor@fedmri.local',
          password: 'SecurePass123!',
          name: 'Test Doctor',
          role: 'DOCTOR',
          hospitalId,
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toEqual({
        id: expect.any(String),
        email: 'test.doctor@fedmri.local',
        name: 'Test Doctor',
        role: 'DOCTOR',
        hospitalId,
      });
    });

    it('should register a PATIENT without hospitalId and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test.patient@fedmri.local',
          password: 'SecurePass123!',
          name: 'Test Patient',
          role: 'PATIENT',
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toEqual({
        id: expect.any(String),
        email: 'test.patient@fedmri.local',
        name: 'Test Patient',
        role: 'PATIENT',
        hospitalId: null,
      });
    });

    it('should reject DOCTOR registration with invalid hospitalId and return 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'invalid.doctor@fedmri.local',
          password: 'SecurePass123!',
          name: 'Invalid Doctor',
          role: 'DOCTOR',
          hospitalId: 'nonexistent-hospital-id',
        })
        .expect(400);

      expect(response.body.message).toContain('Hospital not found');
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials and return accessToken + refreshToken', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test.doctor@fedmri.local',
          password: 'SecurePass123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.role).toBe('DOCTOR');

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });
  });

  describe('GET /users/me', () => {
    it('should return user data with valid Bearer token', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        id: expect.any(String),
        email: 'test.doctor@fedmri.local',
        name: 'Test Doctor',
        role: 'DOCTOR',
        hospitalId,
      });
    });

    it('should return 401 when no Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .expect(401);
    });
  });
});
