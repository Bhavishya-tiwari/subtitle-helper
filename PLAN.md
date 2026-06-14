# Production-Ready Backend Implementation Plan

## Overview
Transform the subtitle-helper backend from development to production-ready with Supabase DB, Google OAuth, rate limiting, security hardening, and legal compliance for Chrome Web Store publishing.

---

## Phase 1: Database Setup (Supabase)

### 1.1 Supabase Project Setup
- [ ] Create Supabase project at https://supabase.com
- [ ] Get project URL and anon/service keys
- [ ] Add environment variables to `.env` and Vercel

### 1.2 Database Schema Design

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  google_id TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Usage logs table (for analytics & debugging)
CREATE TABLE translation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  text_length INTEGER NOT NULL,
  target_language TEXT NOT NULL,
  source_domain TEXT, -- youtube.com, netflix.com
  success BOOLEAN NOT NULL,
  error_message TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limiting table (persistent across restarts)
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_rate_limit UNIQUE(user_id, ip_address, window_start)
);

-- API usage quotas
CREATE TABLE user_quotas (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_limit INTEGER DEFAULT 500, -- translations per day
  monthly_limit INTEGER DEFAULT 10000,
  daily_used INTEGER DEFAULT 0,
  monthly_used INTEGER DEFAULT 0,
  last_daily_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_monthly_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_translation_logs_user_created ON translation_logs(user_id, created_at DESC);
CREATE INDEX idx_rate_limits_user_window ON rate_limits(user_id, window_start);
CREATE INDEX idx_rate_limits_cleanup ON rate_limits(window_start);
```

### 1.3 Row Level Security (RLS)
```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;

-- Users can only read their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Service role can write logs (backend only)
CREATE POLICY "Service can write logs" ON translation_logs
  FOR INSERT WITH CHECK (true);

-- Users can view their own logs
CREATE POLICY "Users can view own logs" ON translation_logs
  FOR SELECT USING (auth.uid() = user_id);
```

---

## Phase 2: Authentication (Google OAuth)

### 2.1 Setup NextAuth.js / Auth.js
- [ ] Install dependencies:
  ```bash
  npm install next-auth@beta @auth/supabase-adapter
  ```

### 2.2 Google Cloud Console Setup
- [ ] Go to https://console.cloud.google.com
- [ ] Create new project "Subtitle Helper"
- [ ] Enable Google+ API
- [ ] Create OAuth 2.0 credentials
  - **Authorized JavaScript origins:**
    - `http://localhost:3000` (dev)
    - `https://subtitle-helper-theta.vercel.app` (prod)
  - **Authorized redirect URIs:**
    - `http://localhost:3000/api/auth/callback/google`
    - `https://subtitle-helper-theta.vercel.app/api/auth/callback/google`
- [ ] Get Client ID and Client Secret

### 2.3 Environment Variables
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# NextAuth
NEXTAUTH_URL=https://subtitle-helper-theta.vercel.app
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

# Existing
GEMINI_API_KEYS=xxx
NODE_ENV=production
```

### 2.4 Auth API Route Structure
```
app/api/auth/
├── [...nextauth]/route.ts   # NextAuth handler
└── session/route.ts          # Extension session validation
```

---

## Phase 3: Backend Implementation

### 3.1 Core Files to Create/Update

**`lib/supabase.ts`** - Supabase client
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Backend uses service key
)
```

**`lib/auth.ts`** - Update with real Google OAuth
```typescript
// Validate session token from extension
// Return user or null
```

**`lib/rate-limit-db.ts`** - Persistent rate limiting
```typescript
// Check rate limit in Supabase
// Support both IP-based (anonymous) and user-based (authenticated)
// Clean up old entries
```

**`lib/usage-tracking.ts`** - Track API usage
```typescript
// Log each translation
// Update daily/monthly quotas
// Check if user exceeded limits
```

**`lib/db/users.ts`** - User CRUD operations
```typescript
// Create user on first login
// Update last_login
// Get user by ID/email
```

### 3.2 Updated API Routes

**`app/api/translate/route.ts`**
- [ ] Validate auth token (optional for now, required later)
- [ ] Check rate limits (DB-backed)
- [ ] Check user quotas
- [ ] Log translation request
- [ ] Return usage stats in response

**`app/api/auth/session/route.ts`** (NEW)
- [ ] Validate JWT token from extension
- [ ] Return user info + remaining quota

**`app/api/auth/extension-login/route.ts`** (NEW)
- [ ] Special endpoint for extension OAuth flow
- [ ] Return JWT token for extension storage

---

## Phase 4: Rate Limiting & Quotas

### 4.1 Multi-Tier Rate Limiting

**Tier 1: Anonymous Users (IP-based)**
- 10 requests per minute
- 100 requests per day
- Encourage login for higher limits

**Tier 2: Authenticated Users**
- 30 requests per minute
- 500 requests per day
- 10,000 requests per month

**Tier 3: Future Premium (Optional)**
- Unlimited requests
- Priority support

### 4.2 Rate Limit Implementation
```typescript
// Check in this order:
// 1. IP rate limit (fast, in-memory cache)
// 2. User rate limit (DB, with caching)
// 3. Daily/monthly quotas (DB)
```

### 4.3 Quota Reset Cron Job
- [ ] Create Vercel Cron endpoint `/api/cron/reset-quotas`
- [ ] Schedule daily at midnight UTC
- [ ] Reset daily counters
- [ ] Reset monthly counters on 1st of month

---

## Phase 5: Chrome Extension Updates

### 5.1 Add OAuth Flow to Extension

**`chrome-extension/auth.js`** (NEW)
```javascript
// Handle Google OAuth login
// Store JWT token in chrome.storage
// Refresh token when expired
```

**Update `background.js`**
- [ ] Include auth token in API requests
- [ ] Handle 401 responses (redirect to login)
- [ ] Show user email/avatar in popup

**Update `popup.html`**
- [ ] Add "Sign in with Google" button
- [ ] Show signed-in user info
- [ ] Display usage quota (X/500 today)
- [ ] "Sign out" option

### 5.2 Extension Permissions Update
```json
// manifest.json
"permissions": [
  "activeTab",
  "storage",
  "identity" // For Google OAuth
]
```

---

## Phase 6: Security Hardening

### 6.1 Input Validation
- [x] Already sanitizing input in `lib/translate.ts`
- [ ] Add rate limiting per text hash (prevent spam of same text)
- [ ] Validate `targetLang` against whitelist
- [ ] Limit subtitle text length (already done: 500 chars)

### 6.2 API Security
- [ ] Add CORS restrictions (only extension + localhost)
- [ ] Validate `Origin` header
- [ ] Add request signing/HMAC (optional, for extra security)
- [ ] Rate limit by IP + User-Agent to prevent bot abuse

### 6.3 Secrets Management
- [ ] Never commit `.env` to git (already in `.gitignore`)
- [ ] Rotate Gemini API keys quarterly
- [ ] Use Vercel environment variables for production
- [ ] Secure Supabase service role key (backend only, never expose)

### 6.4 Monitoring & Alerts
- [ ] Set up Vercel/Supabase alerts for:
  - High error rates (>5% of requests)
  - Unusual traffic spikes
  - API quota approaching limits
  - Suspicious IPs (>1000 requests/hour)

### 6.5 DDoS Protection
- [ ] Vercel has built-in DDoS protection ✓
- [ ] Add Cloudflare in front (optional, if needed)
- [ ] Implement exponential backoff in rate limiting

---

## Phase 7: Legal & Compliance

### 7.1 Privacy Policy ⚠️ CRITICAL
**What to cover:**
- What data we collect:
  - Email, name, Google ID (from OAuth)
  - Subtitle text (temporarily, for translation only)
  - Usage logs (timestamps, language, success/failure)
  - IP addresses (for rate limiting only, retained 7 days)
- How we use it:
  - Provide translation service
  - Prevent abuse
  - Improve service quality
- Data storage:
  - Supabase (EU/US region - specify)
  - Gemini API (Google's privacy policy applies)
- Data sharing:
  - We send subtitle text to Google Gemini API
  - We do NOT sell or share data with third parties
  - We do NOT store subtitle content permanently
- User rights:
  - Request data export
  - Request account deletion
  - Opt out of analytics (if added)
- Data retention:
  - User accounts: Until deletion requested
  - Translation logs: 90 days
  - IP addresses: 7 days
  - Rate limit data: 24 hours

**File:** Create `PRIVACY.md` and host on GitHub Pages

### 7.2 Terms of Service
**What to cover:**
- Service description
- Acceptable use policy:
  - No commercial use without permission
  - No abuse/spam
  - No offensive content translation
- Account termination rights
- Disclaimer:
  - Translation accuracy not guaranteed
  - Service provided "as-is"
  - No warranty for availability
- Limitation of liability
- Governing law (your country)

**File:** Create `TERMS.md`

### 7.3 GDPR Compliance (if EU users)
- [ ] Add "Accept Cookies" banner (if using analytics)
- [ ] Provide data export endpoint `/api/user/export`
- [ ] Provide account deletion endpoint `/api/user/delete`
- [ ] Log data processing activities
- [ ] Appoint data controller (you)

### 7.4 Chrome Web Store Policies Compliance
- [ ] **Single Purpose:** Extension only does subtitle translation ✓
- [ ] **User Data Policy:** Disclose all data usage in listing ✓
- [ ] **Permissions Justification:** Document why each permission is needed ✓
- [ ] **Content Policies:** No misleading content, no mature content ✓
- [ ] **Branding:** No trademark violations (don't use YouTube/Netflix logos)

### 7.5 YouTube/Netflix Terms Review
**Important:** Read their ToS to ensure:
- Not violating their terms by modifying subtitle display
- Not scraping content
- Not interfering with ads
- Likely safe since we're only enhancing accessibility

**Mitigation:** Add disclaimer that extension is not affiliated with YouTube/Netflix

---

## Phase 8: Testing & Quality Assurance

### 8.1 Backend Testing
- [ ] Test auth flow: login → get token → make API call
- [ ] Test rate limiting: exceed limits, check 429 responses
- [ ] Test quota enforcement: exhaust daily limit
- [ ] Test with invalid tokens
- [ ] Test with expired tokens
- [ ] Load test: 100 concurrent requests

### 8.2 Extension Testing
- [ ] Test on YouTube (various subtitle languages)
- [ ] Test on Netflix
- [ ] Test login flow
- [ ] Test when backend is down (graceful error)
- [ ] Test quota exceeded scenario
- [ ] Test on different Chrome versions
- [ ] Test on Chromium-based browsers (Edge, Brave)

### 8.3 Security Testing
- [ ] Try SQL injection in translation text
- [ ] Try XSS in translation response
- [ ] Try JWT token tampering
- [ ] Try excessive requests (rate limit)
- [ ] Check for exposed secrets in public repos

---

## Phase 9: Chrome Web Store Preparation

### 9.1 Assets Required
- [ ] **Screenshots** (1280x800 or 640x400):
  - Extension popup showing settings
  - YouTube video with translation overlay
  - Netflix video with translation overlay
  - Usage quota display
  - (4-5 screenshots total)
- [ ] **Promotional Images:**
  - Small tile: 440x280px
  - Large tile: 920x680px (optional)
  - Marquee: 1400x560px (optional)
- [ ] **Icons** (already have):
  - 16x16, 48x48, 128x128 ✓

### 9.2 Store Listing Content

**Name:** "Subtitle Translator for YouTube & Netflix"

**Tagline (132 chars):**
"Real-time subtitle translation with AI-powered explanations. Learn languages while watching your favorite content."

**Description (detailed):**
```
Subtitle Translator helps you understand video subtitles in your preferred language with AI-powered translations and context.

✨ KEY FEATURES:
• Real-time subtitle translation on YouTube and Netflix
• AI-powered explanations of complex words and phrases
• Support for 10+ languages (Hindi, Spanish, French, German, Japanese, Korean, Chinese, Portuguese, Arabic, Russian)
• Clean, non-intrusive overlay design
• Free to use with generous quotas

🎯 HOW IT WORKS:
1. Install the extension
2. Sign in with Google (free, secure)
3. Enable translation in the extension popup
4. Play any video with subtitles on YouTube or Netflix
5. See instant translations below the original subtitles

🔒 PRIVACY & SECURITY:
• Open source project (link to GitHub)
• No data stored permanently
• Subtitles processed securely through Google Gemini
• GDPR compliant
• See full privacy policy: [link]

📊 USAGE QUOTAS:
• Free users: 500 translations/day, 10,000/month
• More than enough for daily viewing

🌐 SUPPORTED PLATFORMS:
• YouTube (all videos with captions)
• Netflix (all videos with subtitles)
• More platforms coming soon!

⚠️ DISCLAIMER:
This extension is not affiliated with, endorsed by, or sponsored by YouTube, Netflix, or Google. It's an independent tool created to enhance your viewing experience.

🐛 FOUND A BUG?
Report issues on GitHub: [link]

💡 FEATURE REQUESTS?
Open an issue or contact: [your email]
```

**Category:** Productivity or Education

**Language:** English (add more if needed)

### 9.3 Permission Justifications
Prepare clear explanations for Chrome review:

- **`activeTab`:** Required to detect and read subtitles from the current YouTube/Netflix tab
- **`storage`:** Required to save user preferences (backend URL, target language, enable/disable state)
- **`identity`:** Required for secure Google OAuth login to authenticate users
- **`host_permissions` (youtube.com, netflix.com):** Required to inject subtitle detection and translation overlay on these specific platforms only

### 9.4 Privacy Policy & Terms URLs
- Privacy: `https://yourgithub.io/subtitle-helper/privacy`
- Terms: `https://yourgithub.io/subtitle-helper/terms`

---

## Phase 10: Deployment Checklist

### 10.1 Backend (Vercel)
- [ ] Push code to GitHub
- [ ] Connect to Vercel
- [ ] Add environment variables in Vercel dashboard
- [ ] Deploy to production
- [ ] Test production API endpoints
- [ ] Set up custom domain (optional): `api.subtitle-helper.com`

### 10.2 Database (Supabase)
- [ ] Run all SQL migrations
- [ ] Enable RLS policies
- [ ] Test database access from backend
- [ ] Set up automated backups (Supabase Pro, optional)

### 10.3 Extension
- [ ] Update `manifest.json` version to `1.2.0`
- [ ] Update backend URL to production
- [ ] Remove development/debug code
- [ ] Test production build
- [ ] Create ZIP file for upload
- [ ] Keep source code available for review

### 10.4 Chrome Web Store
- [ ] Pay $5 developer registration fee
- [ ] Fill out store listing
- [ ] Upload extension ZIP
- [ ] Submit for review
- [ ] Wait 1-3 days for approval
- [ ] Share link with friends!

---

## Phase 11: Post-Launch Monitoring

### 11.1 Metrics to Track
- [ ] Daily active users (DAU)
- [ ] Translation requests per day
- [ ] Error rate
- [ ] Average API response time
- [ ] Most popular languages
- [ ] Quota usage distribution

### 11.2 Maintenance Tasks
- [ ] Monitor Supabase usage (stay within free tier)
- [ ] Monitor Gemini API usage (stay within quotas)
- [ ] Review error logs weekly
- [ ] Update dependencies monthly
- [ ] Respond to Chrome Web Store reviews
- [ ] Fix critical bugs within 48 hours

### 11.3 Future Enhancements (Post-Launch)
- [ ] Add more languages
- [ ] Support more video platforms (Hulu, Disney+, Prime Video)
- [ ] Add user feedback system
- [ ] Implement caching for common phrases
- [ ] Add keyboard shortcuts
- [ ] Dark mode for overlay
- [ ] Export translation history
- [ ] Language learning mode (quizzes)

---

## Cost Estimation (Free Tier Limits)

### Vercel Free Tier
- ✅ 100 GB bandwidth/month
- ✅ 100 GB-hours compute/month
- ✅ Serverless functions included
- **Estimated:** Should handle 10-50 active users easily

### Supabase Free Tier
- ✅ 500 MB database storage
- ✅ 2 GB bandwidth/month
- ✅ 50,000 monthly active users
- ✅ Unlimited API requests
- **Estimated:** Plenty for small user base

### Google Gemini API Free Tier (as of 2024)
- ✅ 15 requests per minute
- ✅ 1,500 requests per day (per API key)
- **Estimated:** With 3 API keys = 4,500 requests/day
- **For 10 friends:** ~450 requests/day each (plenty!)

### Total Monthly Cost: **$0** (within free tiers)

**Upgrade path if needed:**
- Vercel Pro: $20/month (if bandwidth exceeded)
- Supabase Pro: $25/month (if DB storage exceeded)
- Gemini API paid: ~$0.001 per request (very cheap)

---

## Timeline Estimate

| Phase | Description | Estimated Time |
|-------|-------------|----------------|
| 1 | Supabase setup & schema | 2 hours |
| 2 | Google OAuth setup | 2 hours |
| 3 | Backend implementation | 4-6 hours |
| 4 | Rate limiting & quotas | 2-3 hours |
| 5 | Extension updates | 3-4 hours |
| 6 | Security hardening | 2 hours |
| 7 | Privacy policy & legal docs | 2-3 hours |
| 8 | Testing | 3-4 hours |
| 9 | Chrome Web Store prep | 2 hours |
| 10 | Deployment | 1-2 hours |
| **Total** | **Full implementation** | **23-30 hours** |

*Spread over several days for careful testing*

---

## Quick Start: Next Steps

1. **Right now:** Set up Supabase project
2. **Today:** Implement database schema
3. **Tomorrow:** Set up Google OAuth
4. **Next:** Implement auth + rate limiting
5. **Then:** Update extension
6. **Finally:** Create legal docs & publish

---

## Key Security Principles

✅ **Defense in Depth:** Multiple layers of security (auth, rate limiting, input validation)
✅ **Principle of Least Privilege:** Users only access their own data (RLS)
✅ **Fail Securely:** Errors don't expose sensitive info
✅ **Logging & Monitoring:** Track suspicious activity
✅ **Data Minimization:** Only collect what's necessary
✅ **Transparency:** Clear privacy policy

---

## Success Criteria

- ✅ Friends can install from Chrome Web Store
- ✅ Login works smoothly
- ✅ Translations work on YouTube & Netflix
- ✅ No service interruptions
- ✅ Stay within free tier limits
- ✅ Pass Chrome Web Store review first time
- ✅ No security vulnerabilities
- ✅ Compliant with GDPR & privacy laws
- ✅ Clear privacy policy & terms

---

**Ready to start? Let's begin with Phase 1: Supabase Setup! 🚀**
