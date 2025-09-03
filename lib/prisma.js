const { PrismaClient } = require('@prisma/client');

let prisma;

try {
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient({
      log: ['error'],
    });
  } else {
    // Prevent multiple instances during development
    if (!global.__prisma) {
      global.__prisma = new PrismaClient({
        log: ['error'],
      });
    }
    prisma = global.__prisma;
  }
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  // Create a mock prisma client to prevent crashes
  prisma = {
    $queryRaw: () => Promise.reject(new Error('Database not available')),
    reviewRequest: {
      findUnique: () => Promise.reject(new Error('Database not available')),
      update: () => Promise.reject(new Error('Database not available'))
    },
    event: {
      create: () => Promise.reject(new Error('Database not available'))
    },
    $transaction: () => Promise.reject(new Error('Database not available'))
  };
}

module.exports = { prisma };