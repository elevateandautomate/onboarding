import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Porkbun API Credentials
const API_KEY = process.env.PORKBUN_API_KEY || 'pk1_f102a22a1cff9e3a1baf3a59feb38764cf556d75890962148a697789c4dc290c';
const SECRET_KEY = process.env.PORKBUN_SECRET_KEY || 'sk1_bb12902114b667c24cb861d0a4b14209a785f9fae9cb381262107400f4012540';

// ✅ Slack API Credentials
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'xoxb-8782622636263-8810308655889-qlCPGqfoBpeHYKR65QCzNBuj';

// Enable CORS for all origins
app.use(cors({ origin: '*' }));
app.use(express.json());

// Enhanced logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📝 ${timestamp} | ${req.method} ${req.url}`);

  // Log request body for debugging (but sanitize sensitive data)
  if (req.body) {
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.apikey) sanitizedBody.apikey = '***REDACTED***';
    if (sanitizedBody.secretapikey) sanitizedBody.secretapikey = '***REDACTED***';
    console.log(`📦 Request Body: ${JSON.stringify(sanitizedBody)}`);
  }

  // Capture response for logging
  const originalSend = res.send;
  res.send = function(body) {
    console.log(`📤 Response Status: ${res.statusCode}`);
    // Log response body but limit size
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    console.log(`📤 Response Body: ${bodyStr.substring(0, 200)}${bodyStr.length > 200 ? '...' : ''}`);
    return originalSend.call(this, body);
  };

  next();
});

/* =========================================
   🔍 Domain Check Helper with enhanced error handling
========================================= */
async function checkDomainAvailability(domain) {
  console.log(`🔍 Checking domain availability for: ${domain}`);

  try {
    // Validate domain format
    if (!domain || !domain.includes('.') || domain.length < 3) {
      throw new Error('Invalid domain format');
    }

    // Log request being sent (without credentials)
    console.log(`🔄 Sending request to Porkbun API for domain: ${domain}`);

    const response = await axios.post(
      'https://porkbun.com/api/json/v3/check',
      {
        apikey: API_KEY,
        secretapikey: SECRET_KEY,
        domain
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        // Add timeout to prevent hanging requests
        timeout: 10000
      }
    );

    console.log(`✅ Domain check response status: ${response.status}`);
    console.log(`✅ Domain check response data: ${JSON.stringify(response.data).substring(0, 200)}...`);

    return response.data;
  } catch (err) {
    // Enhanced error logging
    console.error(`❌ Error checking domain "${domain}":`);

    if (err.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`❌ Response status: ${err.response.status}`);
      console.error(`❌ Response data: ${JSON.stringify(err.response.data || {})}`);
      console.error(`❌ Response headers: ${JSON.stringify(err.response.headers || {})}`);
    } else if (err.request) {
      // The request was made but no response was received
      console.error('❌ No response received from Porkbun API');
      console.error(`❌ Request details: ${JSON.stringify(err.request || {})}`);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error(`❌ Error message: ${err.message}`);
    }

    // Rethrow with more context
    throw new Error(`Domain check failed: ${err.message}`);
  }
}

/* =========================================
   🌐 Root Route
========================================= */
app.get('/', (req, res) => {
  res.send('🚀 Porkbun Domain API is live! Use /api/check-domain POST to check availability.');
});

/* =========================================
   🔍 API: Check Domain Availability with better error handling
========================================= */
app.post('/api/check-domain', async (req, res) => {
  const { domainName } = req.body;
  console.log(`📝 Received domain check request for: ${domainName}`);

  // Validate input
  if (!domainName || !domainName.includes('.') || domainName.length < 3) {
    console.log('❌ Invalid domain format in request');
    return res.status(400).json({
      error: '❌ Please provide a valid domain like example.com',
      details: 'Domain must include a TLD (e.g., .com) and be at least 3 characters long'
    });
  }

  try {
    const data = await checkDomainAvailability(domainName);

    if (data.status === 'SUCCESS') {
      const isAvailable = data.available === '1';
      console.log(`✅ Domain ${domainName} availability check: ${isAvailable ? 'Available' : 'Not Available'}`);

      return res.json({
        available: isAvailable,
        domain: domainName,
        price: data.pricing?.registration || 'N/A',
        suggestions: isAvailable ? [] : generateAlternatives(domainName)
      });
    } else {
      console.log(`⚠️ Domain check returned non-success status: ${data.status}`);
      return res.json({
        available: false,
        domain: domainName,
        error: data.message || 'Domain check failed',
        suggestions: generateAlternatives(domainName)
      });
    }
  } catch (err) {
    console.error(`❌ Error in /api/check-domain endpoint: ${err.message}`);

    // Send a more detailed error response
    res.status(500).json({
      error: 'Failed to check domain availability.',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
