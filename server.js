const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Porkbun API Credentials (use environment variables in production)
const API_KEY = process.env.PORKBUN_API_KEY || 'pk1_b66cf696e312c793cea3747eb7f85a6bbe767fb25430ad5419df028a99636b4b';
const SECRET_KEY = process.env.PORKBUN_SECRET_KEY || 'sk1_05c780319c78ccf836f366b47caf33114f1a57e337cc09fbc08256d59f7cca59';

app.use(cors({ origin: '*' }));
app.use(express.json());

// Log every request
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

/* =========================================
   🔍 Domain Check Helper (Correct Endpoint)
========================================= */
async function checkDomainAvailability(domain) {
  try {
    const response = await axios.post('https://porkbun.com/api/json/v3/check', {
      apikey: API_KEY,
      secretapikey: SECRET_KEY,
      domain
    });

    console.log(`✅ Domain check response:`, response.data);
    return response.data;
  } catch (err) {
    console.error(`❌ Error checking domain "${domain}":`, err.response?.data || err.message);
    throw err;
  }
}

/* =========================================
   🌐 Root Route
========================================= */
app.get('/', (req, res) => {
  res.send('🚀 Porkbun Domain API is live! Use /api/check-domain POST to check availability.');
});

/* =========================================
   🔍 API: Check Domain Availability
========================================= */
app.post('/api/check-domain', async (req, res) => {
  const { domainName } = req.body;

  if (!domainName || !domainName.includes('.') || domainName.length < 3) {
    return res.status(400).json({ error: '❌ Please provide a valid domain like example.com' });
  }

  try {
    const data = await checkDomainAvailability(domainName);

    if (data.status === 'SUCCESS') {
      const isAvailable = data.available === '1';
      return res.json({
        available: isAvailable,
        domain: domainName,
        price: data.pricing?.registration || 'N/A',
        suggestions: isAvailable ? [] : generateAlternatives(domainName)
      });
    } else {
      // Known failure, but not a server error
      console.warn(`⚠️ Porkbun returned FAILURE for domain "${domainName}": ${data.message}`);
      return res.json({
        available: false,
        domain: domainName,
        error: data.message || 'Unavailable or invalid domain',
        suggestions: generateAlternatives(domainName)
      });
    }
  } catch (err) {
    res.status(500).json({
      error: 'Failed to check domain availability.',
      details: err.response?.data || err.message
    });
  }
});

/* =========================================
   💡 Suggest Alternative Domains
========================================= */
function generateAlternatives(domain) {
  const parts = domain.split('.');
  if (parts.length < 2) return [];

  const name = parts.slice(0, -1).join('.');
  const ext = parts[parts.length - 1];

  return [
    `${name}-online.${ext}`,
    `${name}-web.${ext}`,
    `get-${name}.${ext}`,
    `${name}-site.${ext}`
  ];
}

/* =========================================
   🔄 Ping Porkbun API
========================================= */
app.get('/ping', async (req, res) => {
  try {
    const response = await axios.post('https://porkbun.com/api/json/v3/ping', {
      apikey: API_KEY,
      secretapikey: SECRET_KEY
    });

    res.json({
      status: response.data.status,
      message: 'Ping successful',
      ip: response.data.yourIp
    });
  } catch (err) {
    res.status(500).json({
      error: 'Ping failed',
      details: err.response?.data || err.message
    });
  }
});

/* =========================================
   🚀 Start Server
========================================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 Using API key: ${API_KEY.substring(0, 10)}...`);
});
