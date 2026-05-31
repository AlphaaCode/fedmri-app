import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Researcher (e2e)', () => {
  let app: INestApplication;
  let researcherToken: string;
  let doctorToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    // Seed accounts created by prisma/seed.ts
    const r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'researcher@fedmri.local', password: 'research1234' })
      .expect(200);
    researcherToken = r.body.accessToken;

    const d = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dr.benali@fedmri.local', password: 'doctor1234' })
      .expect(200);
    doctorToken = d.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const endpoints = [
    '/researcher/overview',
    '/researcher/training-log',
    '/researcher/model-versions',
    '/researcher/topology',
    '/researcher/datasets',
    '/researcher/system-logs',
  ];

  describe('RESEARCHER access (200)', () => {
    it('GET /researcher/overview returns aggregate metrics with rawBytesSent 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/researcher/overview')
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(200);
      expect(typeof res.body.modelVersion).toBe('number');
      expect(res.body.rawBytesSent).toBe(0);
      expect(res.body.patientsProtected).toBe(737);
      expect(typeof res.body.totalRounds).toBe('number');
      // never leaks raw data fields
      expect(JSON.stringify(res.body)).not.toContain('imagePath');
    });

    it('GET /researcher/training-log returns rounds with numeric gradientNorm', async () => {
      const res = await request(app.getHttpServer())
        .get('/researcher/training-log')
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(200);
      expect(Array.isArray(res.body.rounds)).toBe(true);
      expect(res.body.rounds.length).toBeGreaterThan(0);
      expect(typeof res.body.rounds[0].gradientNorm).toBe('number');
      expect(JSON.stringify(res.body)).not.toContain('imagePath');
    });

    it('GET /researcher/model-versions returns versions with hash', async () => {
      const res = await request(app.getHttpServer())
        .get('/researcher/model-versions')
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(200);
      expect(Array.isArray(res.body.versions)).toBe(true);
      expect(res.body.versions.length).toBeGreaterThan(0);
      expect(typeof res.body.versions[0].hash).toBe('string');
    });

    it('GET /researcher/topology returns 3 nodes and correct globalDataVolume', async () => {
      const res = await request(app.getHttpServer())
        .get('/researcher/topology')
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(200);
      expect(res.body.nodes.length).toBe(3);
      expect(res.body.globalDataVolume).toBe(737);
      expect(JSON.stringify(res.body)).not.toContain('imagePath');
    });

    it('GET /researcher/datasets returns 3 cohorts and totalRecords 737', async () => {
      const res = await request(app.getHttpServer())
        .get('/researcher/datasets')
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(200);
      expect(res.body.cohorts.length).toBe(3);
      expect(res.body.totalRecords).toBe(737);
      expect(JSON.stringify(res.body)).not.toContain('imagePath');
    });

    it('GET /researcher/system-logs returns events array with correct totalNodes', async () => {
      const res = await request(app.getHttpServer())
        .get('/researcher/system-logs')
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.totalNodes).toBe(3);
      expect(JSON.stringify(res.body)).not.toContain('imagePath');
    });
  });

  describe('non-researcher is forbidden', () => {
    it.each(endpoints)('DOCTOR gets 403 on %s', async (url) => {
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(403);
    });

    it.each(endpoints)('no token gets 401 on %s', async (url) => {
      await request(app.getHttpServer()).get(url).expect(401);
    });
  });
});
