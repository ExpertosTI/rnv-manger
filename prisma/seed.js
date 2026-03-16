const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey) {
    console.log('Seeding GEMINI_API_KEY from environment...');
    try {
      const existing = await prisma.appSettings.findUnique({
        where: { key: 'gemini_api_key' },
      });

      if (!existing) {
        await prisma.appSettings.create({
          data: {
            key: 'gemini_api_key',
            value: geminiKey,
            category: 'ai'
          },
        });
        console.log('✅ GEMINI_API_KEY seeded successfully.');
      } else {
        console.log('ℹ️ GEMINI_API_KEY already exists in DB, skipping seed.');
      }
    } catch (error) {
      console.error('❌ Error seeding GEMINI_API_KEY:', error);
    }
  } else {
    console.log('⚠️ GEMINI_API_KEY not found in environment, skipping seed.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
