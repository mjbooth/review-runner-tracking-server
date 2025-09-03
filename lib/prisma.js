const { PrismaClient } = require('@prisma/client');

let prisma;

// Global instance for serverless
if (!global.__prisma) {
  try {
    global.__prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'info', 'warn', 'error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  } catch (error) {
    console.error('Failed to initialize Prisma client:', error);
    global.__prisma = null;
  }
}

prisma = global.__prisma;

// If initialization failed, create a fallback
if (!prisma) {
  console.error('Prisma client not available, using fallback');
  prisma = {
    $queryRaw: () => Promise.reject(new Error('Prisma client initialization failed')),
    reviewRequest: {
      findUnique: () => Promise.reject(new Error('Prisma client initialization failed')),
      update: () => Promise.reject(new Error('Prisma client initialization failed'))
    },
    event: {
      create: () => Promise.reject(new Error('Prisma client initialization failed'))
    },
    $transaction: () => Promise.reject(new Error('Prisma client initialization failed'))
  };
}

module.exports = { prisma };