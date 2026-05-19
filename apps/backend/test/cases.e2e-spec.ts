import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InferenceService } from '../src/inference/inference.service';

const FIXED_PREDICTION = {
  predicted_subtype: 'Luminal A',
  confidence: 0.82,
  probs: [0.82, 0.12, 0.04, 0.02],
  model_version: 10,
  strategy: 'FedProx',
};

describe('Cases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let hospitalA_id: string;
  let hospitalB_id: string;
  let doctorA_token: string;
  let doctorB_token: string;
  let patient_token: string;
  let patient_id: string;
  let caseA_id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(InferenceService)
      .useValue({
        predict: jest.fn().mockResolvedValue(FIXED_PREDICTION),
        getAttention: jest.fn().mockResolvedValue({
          attention: new Array(224 * 224).fill(0).map((_, i) =>
            i % 3 === 0 ? 0.5 : 0.1,
          ),
          size: 224,
        }),
      })
      .compile();

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

    // Clean up test data from previous runs will be done after we have user IDs

    // Get hospitals
    const hospitals = await prisma.hospital.findMany({
      take: 2,
    });
    hospitalA_id = hospitals[0].id;
    hospitalB_id = hospitals[1].id;

    // Register and login Doctor A (Hospital A)
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test.doctor.a@fedmri.local',
        password: 'SecurePass123!',
        name: 'Doctor A',
        role: 'DOCTOR',
        hospitalId: hospitalA_id,
      });

    const doctorA_response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test.doctor.a@fedmri.local',
        password: 'SecurePass123!',
      });
    doctorA_token = doctorA_response.body.accessToken;

    // Register and login Doctor B (Hospital B)
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test.doctor.b@fedmri.local',
        password: 'SecurePass123!',
        name: 'Doctor B',
        role: 'DOCTOR',
        hospitalId: hospitalB_id,
      });

    const doctorB_response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test.doctor.b@fedmri.local',
        password: 'SecurePass123!',
      });
    doctorB_token = doctorB_response.body.accessToken;

    // Register and login Patient
    const patient_register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test.patient.cases@fedmri.local',
        password: 'SecurePass123!',
        name: 'Test Patient Cases',
        role: 'PATIENT',
      });

    if (!patient_register.body?.user?.id) {
      console.error('Patient registration failed:', patient_register.status, patient_register.body);
      throw new Error('Patient registration failed');
    }

    patient_id = patient_register.body.user.id;

    const patient_response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test.patient.cases@fedmri.local',
        password: 'SecurePass123!',
      });
    patient_token = patient_response.body.accessToken;
  });

  afterAll(async () => {
    // Clean up test cases and users (delete cases first due to FK constraint)
    const userEmails = [
      'test.doctor.a@fedmri.local',
      'test.doctor.b@fedmri.local',
      'test.patient.cases@fedmri.local',
    ];

    // Get user IDs from emails to delete their cases
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: userEmails,
        },
      },
      select: { id: true },
    });
    const userIds = users.map(u => u.id);

    // Delete cases first (they have FK to users)
    await prisma.case.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });

    // Then delete users
    await prisma.user.deleteMany({
      where: {
        email: {
          in: userEmails,
        },
      },
    });

    await app.close();
  });

  describe('POST /cases', () => {
    it('should upload case as DOCTOR with valid hospitalId and return 201', async () => {
      const fileBuffer = Buffer.from('fake mri data');

      const response = await request(app.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${doctorA_token}`)
        .field('name', 'Test Case A')
        .attach('file', fileBuffer, 'test_case.mha');

      if (response.status !== 201) {
        console.error('Response status:', response.status);
        console.error('Response body:', response.body);
      }
      expect(response.status).toBe(201);

      caseA_id = response.body.id;
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('predictedSubtype');
      expect(response.body.predictedSubtype).toBe('Luminal A');
      expect(response.body.storedLocally).toBe(true);
      expect(response.body.hospitalId).toBe(hospitalA_id);
      expect(response.body.confidence).toBeDefined();
    });

    it('should upload case as PATIENT without hospitalId and return 201', async () => {
      const fileBuffer = Buffer.from('fake mri data');

      const response = await request(app.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${patient_token}`)
        .field('name', 'Test Patient Case')
        .attach('file', fileBuffer, 'patient_case.mha')
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.predictedSubtype).toBe('Luminal A');
      expect(response.body.storedLocally).toBe(true);
      expect(response.body.scope).toBe('PATIENT');
      expect(response.body.hospitalId).toBeNull();
      expect(response.body.userId).toBe(patient_id);
    });
  });

  describe('GET /cases', () => {
    it('should list only Hospital A cases for Doctor A', async () => {
      const response = await request(app.getHttpServer())
        .get('/cases')
        .set('Authorization', `Bearer ${doctorA_token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
      // All cases should belong to hospitalA
      response.body.data.forEach((caseItem: any) => {
        expect(caseItem.hospitalId).toBe(hospitalA_id);
      });
    });

    it('should list only Patient cases for Patient', async () => {
      const response = await request(app.getHttpServer())
        .get('/cases')
        .set('Authorization', `Bearer ${patient_token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      // All cases should belong to patient
      response.body.data.forEach((caseItem: any) => {
        expect(caseItem.userId).toBe(patient_id);
      });
    });
  });

  describe('GET /cases/:id', () => {
    it('should return 403 when Doctor B tries to access Doctor A case', async () => {
      await request(app.getHttpServer())
        .get(`/cases/${caseA_id}`)
        .set('Authorization', `Bearer ${doctorB_token}`)
        .expect(403);
    });

    it('should return case details when Doctor A accesses own case', async () => {
      const response = await request(app.getHttpServer())
        .get(`/cases/${caseA_id}`)
        .set('Authorization', `Bearer ${doctorA_token}`)
        .expect(200);

      expect(response.body.id).toBe(caseA_id);
      expect(response.body.hospitalId).toBe(hospitalA_id);
      expect(response.body.predictedSubtype).toBe('Luminal A');
    });
  });

  describe('GET /cases/:id/attention', () => {
    it('should return attention array of length 50176 for own case', async () => {
      const response = await request(app.getHttpServer())
        .get(`/cases/${caseA_id}/attention`)
        .set('Authorization', `Bearer ${doctorA_token}`)
        .expect(200);

      expect(response.body).toHaveProperty('attention');
      expect(Array.isArray(response.body.attention)).toBe(true);
      expect(response.body.attention.length).toBe(50176);
      expect(response.body.size).toBe(224);
    });

    it('should return 403 when Doctor B requests attention for Doctor A case', async () => {
      await request(app.getHttpServer())
        .get(`/cases/${caseA_id}/attention`)
        .set('Authorization', `Bearer ${doctorB_token}`)
        .expect(403);
    });
  });
});
