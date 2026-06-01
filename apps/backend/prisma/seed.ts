import { PrismaClient, Role, FLStrategy, FLTrigger, PrivacyEvent, CaseScope, CaseStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  const hospitals = await Promise.all([
    prisma.hospital.upsert({ where:{flClientId:"client_0"}, update:{}, create:{flClientId:"client_0",displayName:"Hospital A",totalCases:247} }),
    prisma.hospital.upsert({ where:{flClientId:"client_1"}, update:{}, create:{flClientId:"client_1",displayName:"Hospital B",totalCases:312} }),
    prisma.hospital.upsert({ where:{flClientId:"client_2"}, update:{}, create:{flClientId:"client_2",displayName:"Hospital C",totalCases:178} }),
  ]);

  await prisma.user.upsert({ where:{email:"admin@fedmri.local"}, update:{}, create:{email:"admin@fedmri.local",passwordHash:await bcrypt.hash("admin1234",10),name:"Admin",role:Role.ADMIN,onboardingDone:true} });
  await prisma.user.upsert({ where:{email:"researcher@fedmri.local"}, update:{}, create:{email:"researcher@fedmri.local",passwordHash:await bcrypt.hash("research1234",10),name:"Dr. Imene Researcher",role:Role.RESEARCHER,onboardingDone:true} });

  const doctorDefs = [
    {email:"dr.benali@fedmri.local",name:"Dr. Benali",h:0},
    {email:"dr.mouloud@fedmri.local",name:"Dr. Mouloud",h:0},
    {email:"dr.khelifi@fedmri.local",name:"Dr. Khelifi",h:1},
    {email:"dr.meriem@fedmri.local",name:"Dr. Meriem",h:1},
    {email:"dr.hadj@fedmri.local",name:"Dr. Hadj",h:2},
    {email:"dr.soumia@fedmri.local",name:"Dr. Soumia",h:2},
  ];
  for (const d of doctorDefs) {
    await prisma.user.upsert({ where:{email:d.email}, update:{}, create:{email:d.email,passwordHash:await bcrypt.hash("doctor1234",10),name:d.name,role:Role.DOCTOR,hospitalId:hospitals[d.h].id,onboardingDone:true,casesContributed:Math.floor(Math.random()*40)+10} });
  }

  for (const p of [{email:"sara@fedmri.local",name:"Sara"},{email:"karim@fedmri.local",name:"Karim"}]) {
    await prisma.user.upsert({ where:{email:p.email}, update:{}, create:{email:p.email,passwordHash:await bcrypt.hash("patient1234",10),name:p.name,role:Role.PATIENT} });
  }

  // Real F1 trajectory from thesis training — UPDATE with actual results
  const rounds = [
    {r:1,s:FLStrategy.FEDAVG, fb:0.25,fa:0.29,dur:42},
    {r:2,s:FLStrategy.FEDAVG, fb:0.29,fa:0.32,dur:38},
    {r:3,s:FLStrategy.FEDAVG, fb:0.32,fa:0.34,dur:41},
    {r:4,s:FLStrategy.FEDAVG, fb:0.34,fa:0.36,dur:39},
    {r:5,s:FLStrategy.FEDAVG, fb:0.36,fa:0.37,dur:44},
    {r:6,s:FLStrategy.FEDPROX,fb:0.26,fa:0.30,dur:47},
    {r:7,s:FLStrategy.FEDPROX,fb:0.30,fa:0.33,dur:45},
    {r:8,s:FLStrategy.FEDPROX,fb:0.33,fa:0.36,dur:48},
    {r:9,s:FLStrategy.FEDPROX,fb:0.36,fa:0.39,dur:46},
    {r:10,s:FLStrategy.FEDPROX,fb:0.39,fa:0.41,dur:49},
  ];

  const samples = [247,312,178];
  // Idempotent: only seed the canonical FL rounds when none exist yet, so
  // re-running `prisma db seed` does not duplicate rounds (each create() is
  // non-upsertable). Reset the FL tables first if you need to re-seed clean.
  const existingRounds = await prisma.flRound.count();
  if (existingRounds === 0) {
    let mv = 1;
    for (const rd of rounds) {
      const flRound = await prisma.flRound.create({ data:{roundNumber:rd.r,strategy:rd.s,participants:hospitals.map(h=>h.id),globalF1Before:rd.fb,globalF1After:rd.fa,f1PerClassAfter:{lumA:rd.fa+0.3,lumB:rd.fa-0.1,her2:rd.fa-0.2,tn:rd.fa-0.15},durationSeconds:rd.dur,modelVersion:mv++,triggeredBy:FLTrigger.SCHEDULED} });
      for (let i=0;i<3;i++) {
        await prisma.flContribution.create({ data:{flRoundId:flRound.id,hospitalId:hospitals[i].id,localEpochs:3,samplesUsed:samples[i],localF1Before:rd.fb-0.02*(i+1),localF1After:rd.fa-0.01*(i+1),weightDeltaNorm:0.12+Math.random()*0.08,privacyBudgetUsed:0.1} });
        await prisma.privacyAuditLog.create({ data:{hospitalId:hospitals[i].id,flRoundId:flRound.id,eventType:PrivacyEvent.WEIGHTS_SENT,bytesTransmitted:12_582_912,rawDataTransmitted:0} });
      }
    }
  } else {
    console.log(`Skipping FL round seed (${existingRounds} rounds already exist)`);
  }

  await prisma.modelMetrics.upsert({ where:{modelVersion:10}, update:{}, create:{modelVersion:10,flRound:10,accuracy:0.55,f1Macro:0.41,f1PerClass:{lumA:0.71,lumB:0.29,her2:0.11,tn:0.21},strategy:"FedProx"} });

  // Demo doctor cases for Hospital A (dr.benali's portal). Idempotent: only seed
  // when the hospital has no cases. Inserted directly (NOT via the upload endpoint),
  // so this does NOT trigger FL rounds or inflate researcher totals.
  const docHospital = hospitals[0];
  const existingCases = await prisma.case.count({ where: { hospitalId: docHospital.id } });
  if (existingCases === 0) {
    const doctor = await prisma.user.findUnique({ where: { email: "dr.benali@fedmri.local" } });
    if (doctor) {
      const SUB = ["Luminal A", "Luminal B", "HER2", "Triple Negative"];
      const probsFor = (i: number, conf: number): number[] => {
        const rem = (1 - conf) / 3;
        return [0, 1, 2, 3].map((j) => (j === i ? conf : rem));
      };
      const defs: { i: number; conf: number; status: CaseStatus; days: number }[] = [
        { i: 0, conf: 0.86, status: CaseStatus.VALIDATED, days: 1 },
        { i: 0, conf: 0.78, status: CaseStatus.VALIDATED, days: 2 },
        { i: 0, conf: 0.71, status: CaseStatus.PENDING, days: 3 },
        { i: 1, conf: 0.66, status: CaseStatus.PENDING, days: 5 },
        { i: 0, conf: 0.63, status: CaseStatus.PENDING, days: 6 },
        { i: 1, conf: 0.72, status: CaseStatus.VALIDATED, days: 8 },
        { i: 2, conf: 0.69, status: CaseStatus.VALIDATED, days: 10 },
        { i: 0, conf: 0.58, status: CaseStatus.PENDING, days: 12 },
        { i: 3, conf: 0.81, status: CaseStatus.VALIDATED, days: 14 },
        { i: 1, conf: 0.52, status: CaseStatus.DISPUTED, days: 16 },
        { i: 0, conf: 0.83, status: CaseStatus.VALIDATED, days: 18 },
        { i: 3, conf: 0.55, status: CaseStatus.DISPUTED, days: 21 },
        { i: 0, conf: 0.49, status: CaseStatus.PENDING, days: 24 },
        { i: 0, conf: 0.74, status: CaseStatus.VALIDATED, days: 28 },
      ];
      const now = Date.now();
      await prisma.case.createMany({
        data: defs.map((d) => ({
          userId: doctor.id,
          hospitalId: docHospital.id,
          scope: CaseScope.HOSPITAL,
          imagePath: `uploads/hospitals/${docHospital.id}/demo-${d.i}-${d.days}.png`,
          storedLocally: true,
          predictedSubtype: SUB[d.i],
          confidence: d.conf,
          probs: probsFor(d.i, d.conf),
          modelVersion: 10,
          status: d.status,
          createdAt: new Date(now - d.days * 24 * 60 * 60 * 1000),
        })),
      });
      console.log(`Seeded ${defs.length} demo doctor cases for Hospital A`);
    }
  } else {
    console.log(`Skipping demo cases (${existingCases} already exist for Hospital A)`);
  }

  console.log("Seed complete");
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
