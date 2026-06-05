import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("FireAcademy#$2", 10);
  await prisma.user.upsert({
    where: { email: "chrisw@fia.edu.au" },
    update: { password: hashedPassword },
    create: {
      email: "chrisw@fia.edu.au",
      name: "Chris W",
      password: hashedPassword,
      role: "admin",
    },
  });

  await prisma.brandingSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      primaryColor: "#4F46E5",
      secondaryColor: "#7C3AED",
      loadingText: "Loading your flipbook...",
    },
  });

  console.log("Seed completed successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
