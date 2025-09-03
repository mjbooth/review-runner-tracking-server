require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { prisma } = require('./lib/prisma');
const { logger } = require('./lib/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for redirect pages
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin:', origin);
      callback(null, true); // Allow all for now, restrict later
    }
  },
  credentials: true
}));

// Compression and basic middleware
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'review-runner-tracking',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Review Runner Tracking Server',
    endpoints: {
      health: '/health',
      track: '/:uuid'
    }
  });
});

// Main tracking endpoint - GET /:uuid
app.get('/:uuid', async (req, res) => {
  const startTime = Date.now();
  const { uuid } = req.params;
  
  logger.info('🎯 Tracking request received', { 
    uuid, 
    ip: req.ip, 
    userAgent: req.get('User-Agent') 
  });

  try {
    // Validate UUID format
    if (!uuid || typeof uuid !== 'string' || uuid.length < 10) {
      logger.warn('Invalid UUID format', { uuid });
      return res.status(400).send(generateErrorPage(
        'Invalid Link',
        'This tracking link appears to be malformed.',
        'Please check the link and try again.'
      ));
    }

    // Get client information for tracking
    const userAgent = req.get('User-Agent') || 'unknown';
    const ipAddress = req.get('X-Forwarded-For') || req.get('X-Real-IP') || req.ip || 'unknown';
    const referer = req.get('Referer');

    // Find review request by tracking UUID
    const reviewRequest = await prisma.reviewRequest.findUnique({
      where: { tracking_uuid: uuid },
      include: {
        customers: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        businesses: {
          select: {
            id: true,
            name: true,
            google_review_url: true,
            website: true,
          },
        },
      },
    });

    // Handle invalid or expired links
    if (!reviewRequest) {
      logger.warn('Invalid tracking UUID', { uuid, ipAddress });
      return res.status(404).send(generateErrorPage(
        'Link Not Found',
        'This review link is invalid or has expired.',
        'If you believe this is an error, please contact the business directly.'
      ));
    }

    // Check if request is still active
    if (!reviewRequest.is_active || reviewRequest.status === 'OPTED_OUT') {
      logger.info('Inactive tracking link accessed', { 
        uuid, 
        status: reviewRequest.status,
        is_active: reviewRequest.is_active,
      });
      return res.status(410).send(generateErrorPage(
        'Link Inactive',
        'This review request is no longer active.',
        'You may have already submitted your review or opted out of communications.'
      ));
    }

    // Track the click if not already clicked
    const isFirstClick = !reviewRequest.clicked_at;
    
    if (isFirstClick) {
      await prisma.$transaction(async (tx) => {
        // Update review request with click information
        await tx.reviewRequest.update({
          where: { id: reviewRequest.id },
          data: {
            clicked_at: new Date(),
            status: 'CLICKED',
            click_metadata: {
              userAgent,
              ipAddress,
              referer,
              timestamp: new Date().toISOString(),
              trackingServer: true,
              responseTime: Date.now() - startTime
            },
          },
        });

        // Create click event
        await tx.event.create({
          data: {
            business_id: reviewRequest.business_id,
            review_request_id: reviewRequest.id,
            type: 'REQUEST_CLICKED',
            source: 'tracking_server',
            description: `Review link clicked by ${reviewRequest.customers.first_name} ${reviewRequest.customers.last_name}`,
            metadata: {
              trackingUuid: uuid,
              customerEmail: reviewRequest.customers.email,
              userAgent,
              ipAddress,
              referer,
              trackingServer: true,
              isFirstClick: true
            },
          },
        });
      });

      logger.info('✅ First click tracked successfully', {
        requestId: reviewRequest.id,
        customerId: reviewRequest.customer_id,
        businessId: reviewRequest.business_id,
        responseTime: Date.now() - startTime
      });
    } else {
      // Log repeat click
      logger.info('🔄 Repeat click detected', {
        requestId: reviewRequest.id,
        previousClickAt: reviewRequest.clicked_at,
      });

      // Still create an event for repeat clicks
      await prisma.event.create({
        data: {
          business_id: reviewRequest.business_id,
          review_request_id: reviewRequest.id,
          type: 'REQUEST_CLICKED',
          source: 'tracking_server',
          description: `Repeat click by ${reviewRequest.customers.first_name} ${reviewRequest.customers.last_name}`,
          metadata: {
            trackingUuid: uuid,
            repeatClick: true,
            previousClickAt: reviewRequest.clicked_at,
            userAgent,
            ipAddress,
            referer,
            trackingServer: true,
            isFirstClick: false
          },
        },
      });
    }

    // Determine redirect URL
    const redirectUrl = reviewRequest.businesses.google_review_url || 
                       reviewRequest.review_url || 
                       reviewRequest.businesses.website ||
                       'https://google.com/maps';

    // Log the redirect
    logger.info('🔗 Redirecting to review URL', {
      requestId: reviewRequest.id,
      redirectUrl,
      customerName: `${reviewRequest.customers.first_name} ${reviewRequest.customers.last_name}`,
      totalResponseTime: Date.now() - startTime
    });

    // Generate and send redirect page
    const redirectPage = generateRedirectPage(
      reviewRequest.businesses.name,
      redirectUrl,
      reviewRequest.customers.first_name,
      isFirstClick
    );

    res.set('Content-Type', 'text/html');
    return res.status(200).send(redirectPage);

  } catch (error) {
    logger.error('❌ Tracking server error', {
      uuid,
      error: error.message,
      stack: error.stack,
      responseTime: Date.now() - startTime
    });

    return res.status(500).send(generateErrorPage(
      'Something Went Wrong',
      'We encountered an error processing your request.',
      'Please try again later or contact the business directly.'
    ));
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled server error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(500).send(generateErrorPage(
    'Server Error',
    'An unexpected error occurred.',
    'Please try again later.'
  ));
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('404 - Route not found', { 
    url: req.originalUrl, 
    method: req.method,
    ip: req.ip 
  });
  
  res.status(404).send(generateErrorPage(
    'Not Found',
    'The requested tracking link could not be found.',
    'Please check the URL and try again.'
  ));
});

// Generate HTML error page
function generateErrorPage(title, message, submessage) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} - Review Runner</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 20px;
          background: #ff6b6b;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
        }
        h1 {
          color: #2d3748;
          font-size: 28px;
          margin-bottom: 15px;
          font-weight: 700;
        }
        p {
          color: #718096;
          font-size: 16px;
          line-height: 1.6;
          margin-bottom: 10px;
        }
        .submessage {
          font-size: 14px;
          color: #a0aec0;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">⚠️</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <p class="submessage">${submessage}</p>
      </div>
    </body>
    </html>
  `;
}

// Generate HTML redirect page with tracking
function generateRedirectPage(businessName, redirectUrl, customerName, isFirstClick) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Redirecting to ${businessName} Reviews</title>
      <meta http-equiv="refresh" content="2;url=${redirectUrl}">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          margin: 0 auto 30px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
          color: white;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        h1 {
          color: #2d3748;
          font-size: 24px;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .greeting {
          color: #4a5568;
          font-size: 18px;
          margin-bottom: 20px;
        }
        .business {
          font-size: 20px;
          color: #667eea;
          font-weight: 600;
          margin: 15px 0;
        }
        p {
          color: #718096;
          font-size: 16px;
          line-height: 1.6;
          margin: 15px 0;
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 3px solid #e2e8f0;
          border-top: 3px solid #667eea;
          border-radius: 50%;
          margin: 20px auto;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .manual-link {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
        }
        a {
          color: #667eea;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }
        a:hover {
          color: #764ba2;
          text-decoration: underline;
        }
        .footer {
          margin-top: 30px;
          font-size: 12px;
          color: #a0aec0;
        }
        .tracking-badge {
          background: ${isFirstClick ? '#10b981' : '#f59e0b'};
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          display: inline-block;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="tracking-badge">
          ${isFirstClick ? '✅ First Click Tracked' : '🔄 Repeat Visit'}
        </div>
        <div class="logo">⭐</div>
        <p class="greeting">Hi ${customerName}! 👋</p>
        <h1>Taking you to</h1>
        <div class="business">${businessName}'s Review Page</div>
        <div class="spinner"></div>
        <p>You'll be redirected automatically in a moment...</p>
        
        <div class="manual-link">
          <p>Not redirecting?</p>
          <a href="${redirectUrl}" rel="noopener noreferrer">Click here to continue →</a>
        </div>
        
        <div class="footer">
          <p>Your feedback helps ${businessName} improve their service</p>
          <p style="margin-top: 10px; opacity: 0.7;">Powered by Review Runner Tracking Server</p>
        </div>
      </div>
      
      <script>
        // Backup JavaScript redirect
        setTimeout(function() {
          window.location.href = '${redirectUrl}';
        }, 2000);
        
        // Track page load
        console.log('Review Runner Tracking: Page loaded for ${customerName}');
      </script>
    </body>
    </html>
  `;
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Review Runner Tracking Server started on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;