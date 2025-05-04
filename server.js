// Import required packages
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { WebClient } from '@slack/web-api';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Porkbun API Credentials - Using environment variables
const API_KEY = process.env.PORKBUN_API_KEY;
const SECRET_KEY = process.env.PORKBUN_SECRET_KEY;

// ✅ Slack API Credentials - Using environment variables
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SLACK_HELP_CHANNEL = process.env.SLACK_HELP_CHANNEL || 'client-help';

// Initialize Slack Web Client
const web = new WebClient(SLACK_TOKEN);

// 👥 Internal Team Slack User IDs - Consider moving to environment variables or database
const teamMembers = process.env.TEAM_MEMBERS ? process.env.TEAM_MEMBERS.split(',') : 
                   ['U08PKKX71A7', 'U08PKKUC4UB', 'U08P11AGCMD', 'U08P0JAJQQP'];

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
    if (sanitizedBody.token) sanitizedBody.token = '***REDACTED***';
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
  res.send('🚀 API Server is live! Supports Porkbun domain checks and Slack integration.');
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

/* ============================================================
   1️⃣ Slack OAuth Callback - Auto Channel Creation
============================================================ */
app.get('/success', async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) {
        return res.status(400).send('❌ Missing OAuth code or state.');
    }

    console.log('✅ OAuth callback received.');

    let parsedState;
    try {
        parsedState = JSON.parse(decodeURIComponent(state));
    } catch (err) {
        console.error('❌ Failed to parse state:', err);
        return res.status(400).send('Invalid state data.');
    }

    const { businessName, yourName, email } = parsedState;

    if (![businessName, yourName, email].every(field => field && field.trim() !== '')) {
        return res.status(400).send('❌ Missing required info for channel creation.');
    }

    const channelName = `${businessName}-${yourName}`.toLowerCase().replace(/\s+/g, '-');

    try {
        const finalChannelId = await getOrCreateChannel(channelName);
        await inviteTeamMembers(finalChannelId);
        await inviteClientByEmail(finalChannelId, email);

        res.send(`<h2>🎉 Slack Channel "${channelName}" is Ready!</h2><p>You can now close this window.</p>`);
    } catch (err) {
        console.error('❌ Error during Slack channel process:', err);
        res.status(500).send('Failed to complete Slack channel setup.');
    }
});

/* ============================================================
   🔧 Helper Functions for Slack Channel Creation
============================================================ */

// Check if channel exists OR create it safely
async function getOrCreateChannel(channelName) {
    console.log(`🔎 Checking if channel "${channelName}" exists...`);
    try {
        const list = await web.conversations.list({ types: 'private_channel' });
        const existing = list.channels.find(c => c.name === channelName);

        if (existing) {
            console.log(`✅ Channel "${channelName}" already exists. Using existing channel.`);
            return existing.id;
        }

        console.log(`🚀 Creating new channel "${channelName}"...`);
        const created = await web.conversations.create({ name: channelName, is_private: true });
        console.log(`✅ Channel "${channelName}" created.`);
        return created.channel.id;

    } catch (err) {
        console.error('❌ Failed to get or create channel:', err);
        throw err;
    }
}

// Invite internal team members
async function inviteTeamMembers(channelId) {
    console.log('👥 Inviting internal team members...');
    try {
        await web.conversations.invite({ channel: channelId, users: teamMembers.join(',') });
        console.log('✅ Internal team invited.');
    } catch (err) {
        console.error('❌ Failed to invite internal team:', err);
    }
}

// Invite client using Slack email
async function inviteClientByEmail(channelId, slackEmail) {
    console.log(`📧 Attempting to invite client: ${slackEmail}`);
    try {
        const userResult = await web.users.lookupByEmail({ email: slackEmail });
        await web.conversations.invite({ channel: channelId, users: userResult.user.id });
        console.log(`✅ Client invited: ${slackEmail}`);
    } catch (err) {
        if (err.data && (err.data.error === 'users_not_found' || err.data.error === 'user_not_found')) {
            console.warn(`⚠️ Client with email "${slackEmail}" not found. Ensure they have joined your Slack workspace.`);
        } else {
            console.error('❌ Unexpected error inviting client:', err);
        }
    }
}

/* =========================================
   🔧 SLACK API INTEGRATION
========================================= */

/* =========================================
   📢 Create Slack Channel
========================================= */
app.post('/api/create-slack-channel', async (req, res) => {
  console.log('📢 Create Slack channel request received');
  
  const { channelName, businessName, userEmail } = req.body;
  
  // Validate input
  if (!channelName) {
    return res.status(400).json({
      error: 'Missing required parameter: channelName',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    // Format channel name to follow Slack's requirements
    // Lowercase, no spaces, only alphanumeric and hyphens
    const formattedChannelName = channelName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-') // Replace multiple hyphens with a single one
      .substring(0, 80); // Slack has an 80 character limit for channel names
    
    console.log(`📢 Creating Slack channel: ${formattedChannelName}`);
    
    // Create the channel
    const channelResult = await web.conversations.create({
      name: formattedChannelName,
      is_private: false
    });
    
    console.log(`✅ Slack channel created: ${channelResult.channel.id}`);
    
    // If business name and user email are provided, send a welcome message
    if (businessName && userEmail) {
      const welcomeMessage = `
:wave: New client onboarded!
*Business Name:* ${businessName}
*Contact Email:* ${userEmail}
*Channel Created:* ${new Date().toISOString()}
      `;
      
      await web.chat.postMessage({
        channel: channelResult.channel.id,
        text: welcomeMessage,
        parse: 'full'
      });
      
      console.log(`✅ Welcome message sent to channel: ${channelResult.channel.id}`);
    }
    
    res.json({
      success: true,
      channelId: channelResult.channel.id,
      channelName: formattedChannelName,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error creating Slack channel:', err.message);
    
    const errorResponse = {
      error: 'Failed to create Slack channel',
      details: err.message,
      timestamp: new Date().toISOString()
    };
    
    if (err.data) {
      errorResponse.slackError = err.data;
    }
    
    res.status(500).json(errorResponse);
  }
});

/* =========================================
   💬 Send Slack Message
========================================= */
app.post('/api/send-slack-message', async (req, res) => {
  console.log('💬 Send Slack message request received');
  
  const { channelId, message, blocks } = req.body;
  
  // Validate input
  if (!channelId || (!message && !blocks)) {
    return res.status(400).json({
      error: 'Missing required parameters: channelId and either message or blocks',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    console.log(`💬 Sending message to Slack channel: ${channelId}`);
    
    const messageParams = {
      channel: channelId,
      text: message || 'New message from API'
    };
    
    // Add blocks if provided
    if (blocks) {
      messageParams.blocks = blocks;
    }
    
    const result = await web.chat.postMessage(messageParams);
    
    console.log(`✅ Message sent to Slack channel: ${result.ts}`);
    
    res.json({
      success: true,
      messageTs: result.ts,
      channelId: result.channel,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error sending Slack message:', err.message);
    
    const errorResponse = {
      error: 'Failed to send Slack message',
      details: err.message,
      timestamp: new Date().toISOString()
    };
    
    if (err.data) {
      errorResponse.slack
