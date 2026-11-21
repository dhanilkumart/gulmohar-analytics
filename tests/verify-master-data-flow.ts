import { prisma } from "../src/lib/db/client";

async function run() {
  console.log("=== Central Master Data & Staff Form Verification ===");

  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("No organization found");

  const outlet = await prisma.outlet.findFirst({ where: { organizationId: org.id } });
  if (!outlet) throw new Error("No outlet found");

  console.log(`Testing Organization: ${org.name} (${org.code}), Outlet: ${outlet.code}`);

  // 1. Seed or Verify Admin Master Data:
  // a) Breakage Items
  const plateItem = await prisma.breakageItem.upsert({
    where: { organizationId_code: { organizationId: org.id, code: "BRK-PLATE" } },
    update: { isActive: true, replacementCost: 180.0 },
    create: {
      organizationId: org.id,
      code: "BRK-PLATE",
      name: "Dinner Plate (Porcelain)",
      category: "Tableware",
      replacementCost: 180.0,
      isActive: true,
    },
  });

  const inactiveItem = await prisma.breakageItem.upsert({
    where: { organizationId_code: { organizationId: org.id, code: "BRK-INACTIVE" } },
    update: { isActive: false },
    create: {
      organizationId: org.id,
      code: "BRK-INACTIVE",
      name: "Old Vintage Goblet",
      category: "Glassware",
      replacementCost: 350.0,
      isActive: false,
    },
  });

  // b) Wastage Reasons
  const overprepReason = await prisma.wastageReason.upsert({
    where: { organizationId_code: { organizationId: org.id, code: "WR-OVERPREP" } },
    update: { isActive: true },
    create: {
      organizationId: org.id,
      code: "WR-OVERPREP",
      label: "Overproduction / Excess Batch",
      description: "Batch cooked in excess of daily demand",
      displayOrder: 1,
      isActive: true,
    },
  });

  // c) Breakage Reasons
  const droppedReason = await prisma.breakageReason.upsert({
    where: { organizationId_code: { organizationId: org.id, code: "BR-DROPPED" } },
    update: { isActive: true },
    create: {
      organizationId: org.id,
      code: "BR-DROPPED",
      label: "Dropped / Handling Accident",
      description: "Accidentally slipped from tray or table",
      displayOrder: 1,
      isActive: true,
    },
  });

  console.log("✓ Admin master data records seeded/verified.");

  // 2. Verify that inactive items are excluded from active dropdown queries
  const activeBreakageQuery = await prisma.breakageItem.findMany({
    where: { organizationId: org.id, isActive: true },
  });
  if (activeBreakageQuery.some((i) => i.id === inactiveItem.id)) {
    throw new Error("Inactive breakage item appeared in active query!");
  }
  console.log(`✓ Inactive item filter verified (${activeBreakageQuery.length} active items, inactive item excluded).`);

  // 3. Test Staff Entry: Log Breakage using Master Item
  const user = await prisma.userAccount.findFirst({ where: { organizationId: org.id } });
  const dept = await prisma.department.findFirst({ where: { outletId: outlet.id } });
  if (!user || !dept) throw new Error("Missing user or department for logging test");

  const qty = 3;
  const unitCost = Number(plateItem.replacementCost);
  const totalCost = qty * unitCost;

  const breakageRecord = await prisma.breakageRecord.create({
    data: {
      outletId: outlet.id,
      departmentId: dept.id,
      recordedById: user.id,
      date: new Date(),
      item: plateItem.name,
      brokenQty: qty,
      unitCost: unitCost,
      totalCost: totalCost,
      reason: droppedReason.label,
      notes: "Test incident verification",
    },
  });
  console.log(`✓ Staff breakage record logged: ${breakageRecord.brokenQty} x ${breakageRecord.item}, Unit Cost: ₹${breakageRecord.unitCost}, Total: ₹${breakageRecord.totalCost}, Reason: ${breakageRecord.reason}`);

  // 4. Verify Historical Preservation: Deactivate master item and confirm historical record remains intact
  await prisma.breakageItem.update({
    where: { id: plateItem.id },
    data: { isActive: false },
  });
  const reloadedRecord = await prisma.breakageRecord.findUnique({ where: { id: breakageRecord.id } });
  if (!reloadedRecord || reloadedRecord.item !== plateItem.name || Number(reloadedRecord.totalCost) !== totalCost) {
    throw new Error("Historical record was corrupted by master item deactivation!");
  }
  console.log("✓ Historical record preservation verified after master item deactivation.");

  // Cleanup
  await prisma.breakageRecord.delete({ where: { id: breakageRecord.id } });
  await prisma.breakageItem.delete({ where: { id: inactiveItem.id } });
  await prisma.breakageItem.delete({ where: { id: plateItem.id } });
  await prisma.wastageReason.delete({ where: { id: overprepReason.id } });
  await prisma.breakageReason.delete({ where: { id: droppedReason.id } });
  console.log("✓ Verification test data cleaned up successfully.");

  console.log("=== All Master Data & Form Verification Tests Passed! ===");
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

