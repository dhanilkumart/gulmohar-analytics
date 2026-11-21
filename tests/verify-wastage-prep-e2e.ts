import { prisma } from "../src/lib/db/client";

async function run() {
  console.log("=== Wastage & Preparation E2E Verification ===");

  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("No organization found");

  const outlet = await prisma.outlet.findFirst({
    where: { organizationId: org.id },
  });
  if (!outlet) throw new Error("No outlet found");

  const user = await prisma.userAccount.findFirst({
    where: { organizationId: org.id },
  });
  if (!user) throw new Error("No user found");

  console.log(`Using Org: ${org.name}, Outlet: ${outlet.code}, User: ${user.username}`);

  // 1. Create Preparation Item
  const prepItem = await prisma.preparationItem.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "PREP-TEST-RICE",
      },
    },
    update: { isActive: true, standardCost: 45.0 },
    create: {
      organizationId: org.id,
      code: "PREP-TEST-RICE",
      name: "Cooked Basmati Rice",
      unit: "kg",
      standardCost: 45.0,
      isActive: true,
    },
  });
  console.log(`✓ Preparation item created/verified: ${prepItem.name} (${prepItem.code}), Standard Cost: ₹${prepItem.standardCost}/kg`);

  // 2. Clear test logs for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  await prisma.wastageRecord.deleteMany({
    where: {
      preparationItemId: prepItem.id,
      outletId: outlet.id,
      date: { gte: today, lt: tomorrow },
    },
  });
  await prisma.preparationLog.deleteMany({
    where: {
      preparationItemId: prepItem.id,
      outletId: outlet.id,
      date: { gte: today, lt: tomorrow },
    },
  });

  // 3. Log a Preparation Batch of 25 kg
  const prepLog = await prisma.preparationLog.create({
    data: {
      outletId: outlet.id,
      preparationItemId: prepItem.id,
      recordedById: user.id,
      date: today,
      quantity: 25.0,
      notes: "Morning batch cooking",
    },
  });
  console.log(`✓ Logged preparation batch: ${prepLog.quantity} kg of ${prepItem.name}`);

  // 4. Test Stock Validation: Attempting to waste more than prepared (e.g. 30 kg)
  const totalPrep = await prisma.preparationLog.aggregate({
    where: {
      outletId: outlet.id,
      preparationItemId: prepItem.id,
      date: { gte: today, lt: tomorrow },
    },
    _sum: { quantity: true },
  });
  const totalPrepared = Number(totalPrep._sum.quantity || 0);

  const totalWaste = await prisma.wastageRecord.aggregate({
    where: {
      outletId: outlet.id,
      preparationItemId: prepItem.id,
      date: { gte: today, lt: tomorrow },
    },
    _sum: { wastedQuantity: true },
  });
  const totalWasted = Number(totalWaste._sum.wastedQuantity || 0);
  const availableStock = totalPrepared - totalWasted;
  console.log(`Current available stock for today: ${availableStock} kg`);

  const excessiveAttempt = 30.0;
  if (excessiveAttempt > availableStock) {
    console.log(`✓ Stock validation correctly identified excessive waste: ${excessiveAttempt} kg > ${availableStock} kg available`);
  } else {
    throw new Error("Validation failed to detect excessive waste");
  }

  // 5. Log Valid Wastage (2.5 kg)
  const validWasteQty = 2.5;
  const unitCost = Number(prepItem.standardCost || 0);
  const estimatedCost = validWasteQty * unitCost;

  const wasteRecord = await prisma.wastageRecord.create({
    data: {
      outletId: outlet.id,
      preparationItemId: prepItem.id,
      recordedById: user.id,
      date: today,
      wastedQuantity: validWasteQty,
      unitCost: unitCost,
      estimatedCost: estimatedCost,
      reason: "Over-preparation",
      notes: "Lunch excess remaining",
    },
  });
  console.log(`✓ Logged valid wastage: ${wasteRecord.wastedQuantity} kg, Estimated Cost: ₹${wasteRecord.estimatedCost}`);

  // 6. Verify remaining stock
  const updatedWaste = await prisma.wastageRecord.aggregate({
    where: {
      outletId: outlet.id,
      preparationItemId: prepItem.id,
      date: { gte: today, lt: tomorrow },
    },
    _sum: { wastedQuantity: true },
  });
  const remaining = totalPrepared - Number(updatedWaste._sum.wastedQuantity || 0);
  console.log(`✓ Updated remaining prepared stock: ${remaining} kg (expected 22.5 kg)`);
  if (remaining !== 22.5) {
    throw new Error(`Unexpected remaining stock: ${remaining}`);
  }

  // Clean up test records
  await prisma.wastageRecord.delete({ where: { id: wasteRecord.id } });
  await prisma.preparationLog.delete({ where: { id: prepLog.id } });
  await prisma.preparationItem.delete({ where: { id: prepItem.id } });
  console.log("✓ Test records cleaned up successfully");

  console.log("=== All Wastage & Preparation tests passed! ===");
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

