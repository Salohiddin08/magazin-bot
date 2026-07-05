const { PrismaClient } = require('@prisma/client');

// Butun loyiha uchun yagona Prisma client
const prisma = new PrismaClient();

module.exports = prisma;
