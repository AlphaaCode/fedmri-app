import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const FL_SECRET = process.env.FL_WEBHOOK_SECRET || 'dev-webhook-secret';

describe('FL (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let hospitalA_id: string;
  let hospitalB_id: string;
  let hospitalA_flClientId: string;
  let hospitalB_flClientId: string;
  let hospitalC_flClientId: string;
  let doctorA_token: string;
  let doctorB_token: string;
  let createdRoundId: string;

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

    const hospitals = await prisma.hospital.findMany({ take: 3 });
    hospitalA_id = hospitals[0].id;
    hospitalB_id = hospitals[1].id;
    hospitalA_flClientId = hospitals[0].flClientId;
    hospitalB_flClientId = hospitals[1].flClientId;
    hospitalC_flClientId = hospitals[2].flClientId;

    // Register + login Doctor A
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test.fl.doctor.a@fedmri.local',
        password: 'SecurePass123!',
        name: 'FL Doctor A',
        role: 'DOCTOR',
        hospitalId: hospitalA_id,
      });
    const docA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test.fl.doctor.a@fedmri.local',
        password: 'SecurePass123!',
      });
    doctorA_token = docA.body.accessToken;

    // Register + login Doctor B
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test.fl.doctor.b@fedmri.local',
        password: 'SecurePass123!',
        name: 'FL Doctor B',
        role: 'DOCTOR',
        hospitalId: hospitalB_id,
      });
    const docB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test.fl.doctor.b@fedmri.local',
        password: 'SecurePass123!',
      });
    doctorB_token = docB.body.accessToken;
  });

  afterAll(async () => {
    const userEmails = [
      'test.fl.doctor.a@fedmri.local',
      'test.fl.doctor.b@fedmri.local',
    ];

    // Clean up FL data created by this test
    if (createdRoundId) {
      await prisma.privacyAuditLog.deleteMany({
        where: { flRoundId: createdRoundId },
      });
      await prisma.flContribution.deleteMany({
        where: { flRoundId: createdRoundId },
      });
      await prisma.flRound.deleteMany({
        where: { id: createdRoundId },
      });
    }

    await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
    await app.close();
  });

  describe('POST /internal/fl/round-complete', () => {
    it('should reject request without secret', async () => {
      await request(app.getHttpServer())
        .post('/internal/fl/round-complete')
        .send({ round_id: 'x' })
        .expect(400);
    });

    it('should reject request with wrong secret', async () => {
      await request(app.getHttpServer())
        .post('/internal/fl/round-complete')
        .set('x-fl-secret', 'wrong-secret')
        .send({ round_id: 'x' })
        .expect(400);
    });

    it('should persist FlRound + contributions + privacy logs with valid secret', async () => {
      createdRoundId = `test-round-${Date.now()}`;

      const payload = {
        round_id: createdRoundId,
        round_number: 11,
        strategy: 'FEDPROX',
        global_f1_before: 0.41,
        global_f1_after: 0.45,
        f1_per_class_after: {
          lumA: 0.74,
          lumB: 0.28,
          her2: 0.12,
          tn: 0.22,
        },
        duration_seconds: 30,
        model_version: 11,
        contributions: [
          {
            hospital_id: hospitalA_flClientId,
            local_epochs: 3,
            samples_used: 247,
            local_f1_before: 0.40,
            local_f1_after: 0.43,
            weight_delta_norm: 0.15,
            privacy_budget_used: 0.1,
          },
          {
            hospital_id: hospitalB_flClientId,
            local_epochs: 3,
            samples_used: 312,
            local_f1_before: 0.39,
            local_f1_after: 0.44,
            weight_delta_norm: 0.13,
            privacy_budget_used: 0.1,
          },
          {
            hospital_id: hospitalC_flClientId,
            local_epochs: 3,
            samples_used: 178,
            local_f1_before: 0.41,
            local_f1_after: 0.45,
            weight_delta_norm: 0.17,
            privacy_budget_used: 0.1,
          },
        ],
        triggered_hospital: hospitalA_flClientId,
      };

      await request(app.getHttpServer())
        .post('/internal/fl/round-complete')
        .set('x-fl-secret', FL_SECRET)
        .send(payload)
        .expect(200);

      const round = await prisma.flRound.findUnique({
        where: { id: createdRoundId },
        include: { contributions: true, privacyLogs: true },
      });
      expect(round).toBeTruthy();
      expect(round!.roundNumber).toBe(11);
      expect(round!.strategy).toBe('FEDPROX');
      expect(round!.contributions.length).toBe(3);
      expect(round!.privacyLogs.length).toBe(3);

      // Invariant #1: rawDataTransmitted is ALWAYS 0
      for (const log of round!.privacyLogs) {
        expect(log.rawDataTransmitted).toBe(0);
      }
    });
  });

  describe('POST /internal/fl/progress', () => {
    it('should accept progress event with valid secret', async () => {
      await request(app.getHttpServer())
        .post('/internal/fl/progress')
        .set('x-fl-secret', FL_SECRET)
        .send({
          round_id: createdRoundId || 'round-x',
          hospital_id: hospitalA_flClientId,
          phase: 'local_training',
          epochs_done: 1,
        })
        .expect(200);
    });

    it('should reject progress without secret', async () => {
      await request(app.getHttpServer())
        .post('/internal/fl/progress')
        .send({ round_id: 'x' })
        .expect(400);
    });
  });

  describe('GET /fl/rounds', () => {
    it('should return paginated rounds for authenticated doctor', async () => {
      const res = await request(app.getHttpServer())
        .get('/fl/rounds')
        .set('Authorization', `Bearer ${doctorA_token}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/fl/rounds').expect(401);
    });
  });

  describe('GET /fl/privacy-log', () => {
    it('should return only current hospital privacy logs for Doctor A', async () => {
      const res = await request(app.getHttpServer())
        .get('/fl/privacy-log')
        .set('Authorization', `Bearer ${doctorA_token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // Every row must belong to Hospital A and have rawDataTransmitted=0
      for (const log of res.body) {
        expect(log.hospitalId).toBe(hospitalA_id);
        expect(log.rawDataTransmitted).toBe(0);
      }
    });

    it('should return only Hospital B logs for Doctor B (silo check)', async () => {
      const res = await request(app.getHttpServer())
        .get('/fl/privacy-log')
        .set('Authorization', `Bearer ${doctorB_token}`)
        .expect(200);

      for (const log of res.body) {
        expect(log.hospitalId).toBe(hospitalB_id);
      }
    });
  });

  describe('GET /fl/hospital/contribution', () => {
    it('should return only Hospital A stats for Doctor A', async () => {
      const res = await request(app.getHttpServer())
        .get('/fl/hospital/contribution')
        .set('Authorization', `Bearer ${doctorA_token}`)
        .expect(200);

      expect(res.body.hospitalId).toBe(hospitalA_id);
      expect(res.body).toHaveProperty('totalRounds');
      expect(res.body).toHaveProperty('totalSamples');
    });
  });
});
