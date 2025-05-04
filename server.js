// Import required packages
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Porkbun API Credentials
const API_KEY = process.env.PORKBUN_API_KEY || 'pk1_b66cf696e312c793cea3747eb7f85a6bbe767fb25430ad5419df028a99636b4b';
const SECRET_KEY = process.env.PORKBUN_SECRET_KEY || 'sk1_05c780319c78ccf836f366b47caf33114f1a57e337cc09fbc08256d59f7cca59';

// Enable CORS for all origins
app.use(cors({ origin: '*' }));
app.use(express.json());

// Enhanced logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📝 ${timestamp} | ${req.method} ${req.url}`);
  
  // Log request body for debugging (but sanitize sensitive data)
  if (req.body && Object.keys(req.body).length > 0) {
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
});

/* =========================================
   💡 Suggest Alternative Domains
========================================= */
function generateAlternatives(domain) {
  console.log(`💡 Generating alternatives for domain: ${domain}`);
  
  const parts = domain.split('.');
  if (parts.length < 2) return [];

  const name = parts.slice(0, -1).join('.');
  const ext = parts[parts.length - 1];

  const alternatives = [
    `${name}-online.${ext}`,
    `${name}-web.${ext}`,
    `get-${name}.${ext}`,
    `${name}-site.${ext}`
  ];
  
  console.log(`💡 Generated ${alternatives.length} alternatives`);
  return alternatives;
}

/* =========================================
   🔄 Ping Porkbun API + Get Server IP
========================================= */
app.get('/ping', async (req, res) => {
  console.log('🔄 Ping request received');
  
  try {
    console.log('🔄 Sending ping to Porkbun API');
    const response = await axios.post(
      'https://porkbun.com/api/json/v3/ping',
      {
        apikey: API_KEY,
        secretapikey: SECRET_KEY
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 5000 // 5 second timeout
      }
    );

    console.log(`✅ Porkbun ping successful: ${JSON.stringify(response.data)}`);
    res.json({
      status: response.data.status,
      message: 'Ping successful',
      ip: response.data.yourIp
    });
  } catch (err) {
    console.error('❌ Porkbun ping failed:', err.message);
    
    // Enhanced error response
    const errorResponse = {
      error: 'Ping failed',
      details: err.message,
      timestamp: new Date().toISOString()
    };
    
    // Add response data if available
    if (err.response && err.response.data) {
      errorResponse.apiResponse = err.response.data;
    }
    
    res.status(500).json(errorResponse);
  }
});

/* =========================================
   📡 My Server IP (to share with Porkbun support)
========================================= */
app.get('/my-ip', async (req, res) => {
  console.log('📡 IP address request received');
  
  try {
    console.log('📡 Fetching server IP from ipify');
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    console.log(`✅ IP fetch successful: ${response.data.ip}`);
    res.json({ ip: response.data.ip });
  } catch (err) {
    console.error('❌ IP fetch failed:', err.message);
    res.status(500).json({
      error: 'Failed to fetch IP address.',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

/* =========================================
   🧪 Test Route - For checking if API keys work
========================================= */
app.get('/test-keys', async (req, res) => {
  console.log('🧪 Testing API keys');
  
  try {
    // First try a ping to see if basic auth works
    const pingResponse = await axios.post(
      'https://porkbun.com/api/json/v3/ping',
      {
        apikey: API_KEY,
        secretapikey: SECRET_KEY
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 5000
      }
    );
    
    // If ping works, try a domain check for a known domain
    const checkResponse = await axios.post(
      'https://porkbun.com/api/json/v3/check',
      {
        apikey: API_KEY,
        secretapikey: SECRET_KEY,
        domain: 'example.com'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 5000
      }
    );
    
    res.json({
      status: 'success',
      pingResponse: pingResponse.data,
      checkResponse: checkResponse.data,
      message: 'API keys are working correctly'
    });
  } catch (err) {
    console.error('❌ API key test failed:', err.message);
    
    const errorResponse = {
      status: 'error',
      message: 'API key test failed',
      error: err.message,
      timestamp: new Date().toISOString()
    };
    
    if (err.response) {
      errorResponse.responseStatus = err.response.status;
      errorResponse.responseData = err.response.data;
    }
    
    res.status(500).json(errorResponse);
  }
});

/* =========================================
   🚀 Start Server
========================================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 Using API key: ${API_KEY.substring(0, 10)}...`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📝 API Endpoints:`);
  console.log(`   - POST /api/check-domain`);
  console.log(`   - GET /ping`);
  console.log(`   - GET /my-ip`);
  console.log(`   - GET /test-keys`);
});
