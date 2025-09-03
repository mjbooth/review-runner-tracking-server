# Review Runner Tracking Server

A lightweight Express.js microservice that handles review request tracking URLs without authentication, designed to bypass Clerk middleware issues in the main Next.js application.

## 🎯 Purpose

This tracking server provides public URL access at `track.domain.com/uuid123` to handle customer review link clicks, record analytics, and redirect users to review platforms - all without requiring authentication.

Designed as a lightweight microservice to bypass Clerk middleware restrictions in the main Next.js application.

## ✨ Features

- **Public Access** - No authentication required, bypasses Clerk middleware
- **Click Tracking** - Records timestamps, metadata, and customer interactions  
- **Smart Redirects** - Routes to Google Reviews, business websites, or fallback URLs
- **Event Logging** - Creates comprehensive audit trail in shared database
- **Error Handling** - Professional branded error pages for invalid/expired links
- **Mobile Responsive** - Works seamlessly on all device sizes
- **Fast Performance** - < 200ms average response time

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (shared with main app)
- Environment variables configured

### Installation

```bash
# Clone repository
git clone <repository-url>
cd review-runner-tracking-server

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file:

```env
DATABASE_URL="postgresql://username:password@host:port/database"
DIRECT_URL="postgresql://username:password@host:port/database"
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

## 📡 API Endpoints

### Health Check
```
GET /health
```
Returns server status and version information.

### Root Information  
```
GET /
```
Shows available endpoints and service information.

### Tracking Handler
```
GET /:uuid
```
Main tracking endpoint that:
1. Validates tracking UUID
2. Looks up review request in database
3. Records click event and metadata
4. Returns branded redirect page
5. Automatically redirects to review URL

## 🏗️ Architecture

```
Customer clicks link → Tracking Server → Database Update → Redirect Page → Review Platform
```

### Database Integration
- Connects to shared PostgreSQL database
- Uses Prisma ORM for type-safe database operations
- Compatible with existing schema from main application

### Key Models
- `ReviewRequest` - Tracks review requests and click data
- `Event` - Logs all tracking server interactions  
- `Business` - Business information for redirects
- `Customer` - Customer details for personalization

## 🎨 User Experience

### Success Flow
1. Customer receives tracking link via email/SMS
2. Clicks link → Beautiful loading page appears
3. Shows personalized message with business name
4. Auto-redirects to review platform after 2 seconds
5. Fallback manual "click here" link provided

### Error Handling
- **Invalid UUID** → "Invalid Link" error page
- **Expired Link** → "Link Inactive" error page  
- **Not Found** → "Link Not Found" error page
- **Server Error** → "Something Went Wrong" error page

## 🔧 Development

### Scripts
```bash
npm run dev      # Start with nodemon (development)
npm start        # Start production server
npm run build    # No build step needed
```

### Database Operations
```bash
npx prisma generate    # Generate Prisma client
npx prisma db pull     # Pull schema from database
npx prisma studio      # Open database browser
```

### Testing Endpoints
```bash
# Health check
curl http://localhost:3001/health

# Test invalid UUID
curl http://localhost:3001/invalid-uuid

# Test valid format (will show 404 if not in database)
curl http://localhost:3001/550e8400-e29b-41d4-a716-446655440000
```

## 📊 Monitoring & Analytics

### Logs
- Structured JSON logging via Pino
- Request tracking with unique identifiers
- Performance metrics (response times)
- Error tracking with stack traces

### Metrics Tracked
- Click timestamps (first click vs repeat visits)
- User agent and IP address information
- Referrer tracking
- Response times
- Success/error rates

### Database Events
All interactions create `Event` records with:
- Event type (`REQUEST_CLICKED`)
- Source (`tracking_server`)  
- Metadata (user agent, IP, timing)
- Relationship to business and review request

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Deploy to Vercel
vercel --prod

# Environment variables required:
# - DATABASE_URL
# - DIRECT_URL  
# - ALLOWED_ORIGINS
```

### Manual Deployment
```bash
# Build and start
npm install --production
npm start
```

### Domain Configuration
- Set up DNS: `track.yourdomain.com` → Server IP
- Configure SSL certificate
- Update CORS origins in environment variables

## 📈 Performance Specs

- **Response Time**: < 200ms average
- **Uptime Target**: 99.9%
- **Throughput**: 10,000+ requests/month
- **Database**: Connection pooling enabled
- **Caching**: 15-minute response cache

## 🔒 Security

- **Helmet.js** - Security headers enabled
- **CORS** - Configurable origin restrictions  
- **Input Validation** - UUID format validation
- **No Authentication** - By design for public access
- **Rate Limiting** - Consider adding for production

## 🐛 Troubleshooting

### Common Issues

**Server won't start:**
```bash
# Regenerate Prisma client
npx prisma generate
npm run dev
```

**Database connection errors:**
- Check DATABASE_URL format
- Verify database is accessible
- Ensure schema matches with `npx prisma db pull`

**CORS errors:**
- Add domain to ALLOWED_ORIGINS
- Check protocol (http vs https)

### Debug Mode
```bash
# Enable verbose logging
LOG_LEVEL=debug npm run dev
```

## 📝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Support

For issues and questions:
- Create GitHub issue
- Check server logs for error details
- Verify database connectivity
- Test with health endpoint first

---

**Built with ❤️ for Review Runner** - Streamlining customer feedback collection