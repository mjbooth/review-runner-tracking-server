const { PrismaClient } = require('@prisma/client');

let prisma;

function createPrismaClient() {
  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? [] : ['error'],
      errorFormat: 'minimal',
    });
  } catch (error) {
    console.error('Prisma client creation failed:', error.message);
    return null;
  }
}

// Use global instance to prevent multiple connections in serverless
if (typeof global !== 'undefined') {
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
} else {
  // Fallback for environments without global
  prisma = createPrismaClient();
}

// If still no prisma client, create a mock to prevent crashes
if (!prisma) {
  console.warn('Creating mock Prisma client - database operations will fail');
  prisma = {
    $queryRaw: () => Promise.reject(new Error('Prisma client unavailable')),
    reviewRequest: {
      findUnique: () => Promise.reject(new Error('Prisma client unavailable')),
      update: () => Promise.reject(new Error('Prisma client unavailable'))
    },
    event: {
      create: () => Promise.reject(new Error('Prisma client unavailable'))
    },
    $transaction: () => Promise.reject(new Error('Prisma client unavailable'))
  };
}

module.exports = { prisma };