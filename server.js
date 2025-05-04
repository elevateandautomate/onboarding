// Import required packages
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { WebClient } from '@slack/web-api';

// Load environment variables
dotenv.config();

// Initialize Express app - THIS MUST COME BEFORE DEFINING ROUTES
const app = express();
const PORT = process.env.PORT || 3000;

// API Credentials from environment variables
const API_KEY = process.env.PORKBUN_API_KEY || 'pk1_f102a22a1cff9e3a1baf3a59feb38764cf556d75890962148a697789c4dc290c';
const SECRET_KEY = process.env.PORKBUN_SECRET_KEY || 'sk1_bb12902114b667c24cb861d0a4b14209a785f9fae9cb381262107400f4012540';
const SLACK_TOKEN = process.env.SLACK_TOKEN || 'xoxb-8782622636263-8810308655889-qlCPGqfoBpeHYKR65QCzNBuj';
const SLACK_HELP_CHANNEL = process.env.SLACK_HELP_CHANNEL || 'client-help';

// Initialize Slack Web Client
const web = new WebClient(SLACK_TOKEN);

// Team members
const teamMembers = process.env.TEAM_MEMBERS ? 
                   process.env.TEAM_MEMBERS.split(',') : 
                   ['U08PKKX71A7', 'U08PKKUC4UB', 'U08P11AGCMD', 'U08P0JAJQQP'];

// Middleware - THESE MUST COME BEFORE ROUTES
app.use(cors({ origin: '*' }));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

// Root route
app.get('/', (req, res) => {
  res.send('API Server is running! Supports Porkbun domain checks and Slack integration.');
});

// Check domain availability
app.post('/api/check-domain', async (req, res) => {
  const { domainName } = req.body;
  console.log(`Received domain check request for: ${domainName}`);
  
  if (!domainName || !domainName.includes('.')) {
    return res.status(400).json({ 
      error: 'Invalid domain format',
      message: 'Please provide a valid domain like example.com'
    });
  }
  
  try {
    console.log(`Sending request to Porkbun API for domain: ${domainName}`);
    
    // Add request ID for tracking
    const requestId = Date.now().toString();
    console.log(`Request ID: ${requestId}`);
    
    const response = await axios.post(
      'https://porkbun.com/api/json/v3/check',
      {
        apikey: API_KEY,
        secretapikey: SECRET_KEY,
        domain: domainName
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Request-ID': requestId
        },
        timeout: 15000 // Increased timeout
      }
    );
    
    console.log(`Response status for ${requestId}: ${response.status}`);
    
    const data = response.data;
    
    if (data.status === 'SUCCESS') {
      const isAvailable = data.available === '1';
      console.log(`Domain ${domainName} availability: ${isAvailable ? 'Available' : 'Not Available'}`);
      
      return res.json({
        available: isAvailable,
        domain: domainName,
        price: data.pricing?.registration || 'N/A',
        suggestions: isAvailable ? [] : generateAlternatives(domainName),
        requestId: requestId
      });
    } else {
      console.log(`Domain check returned non-success status: ${data.status}`);
      return res.json({
        available: false,
        domain: domainName,
        error: data.message || 'Domain check failed',
        suggestions: generateAlternatives(domainName),
        requestId: requestId
      });
    }
  } catch (err) {
    console.error('Error checking domain:', err.message);
    
    // Enhanced error logging
    if (err.response) {
      console.error(`Response status: ${err.response.status}`);
      console.error(`Response data:`, err.response.data);
      console.error(`Response headers:`, err.response.headers);
    } else if (err.request) {
      console.error('No response received');
    }
    
    // Try to determine if this is an IP whitelisting issue
    const isLikelyIpIssue = 
      (err.response && err.response.status === 403) || 
      err.message.includes('403') ||
      err.message.includes('forbidden');
    
    // Send a more detailed error response
    res.status(500).json({
      error: 'Failed to check domain availability',
      details: err.message,
      possibleCause: isLikelyIpIssue ? 
        'This appears to be an IP whitelisting issue. The Porkbun API may be blocking requests from this server.' : 
        'Unknown error occurred',
      suggestions: generateAlternatives(domainName),
      timestamp: new Date().toISOString()
    });
  }
});

// Generate alternative domains
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

// Get server IP
app.get('/my-ip', async (req, res) => {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    res.json({ ip: response.data.ip });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch IP address',
      details: err.message
    });
  }
});

// Test Porkbun API keys
app.get('/test-keys', async (req, res) => {
  try {
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
        timeout: 5000
      }
    );
    
    res.json({
      status: 'success',
      response: response.data,
      message: 'API keys are working correctly'
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'API key test failed',
      error: err.message
    });
  }
});

// Add a diagnostic endpoint for Porkbun API
app.get('/api/diagnose-porkbun', async (req, res) => {
  console.log('Running Porkbun API diagnostics');
  
  const diagnosticResults = {
    timestamp: new Date().toISOString(),
    serverIp: null,
    pingTest: null,
    domainCheckTest: null,
    apiKeysPresent: {
      apiKey: Boolean(API_KEY),
      secretKey: Boolean(SECRET_KEY)
    }
  };
  
  try {
    // 1. Get server IP
    console.log('Getting server IP...');
    const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    diagnosticResults.serverIp = ipResponse.data.ip;
    console.log(`Server IP: ${diagnosticResults.serverIp}`);
    
    // 2. Test ping endpoint
    console.log('Testing Porkbun ping endpoint...');
    try {
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
      
      diagnosticResults.pingTest = {
        success: true,
        status: pingResponse.status,
        data: pingResponse.data
      };
      console.log('Ping test successful');
    } catch (pingErr) {
      diagnosticResults.pingTest = {
        success: false,
        error: pingErr.message,
        status: pingErr.response?.status,
        data: pingErr.response?.data
      };
      console.log('Ping test failed');
    }
    
    // 3. Test domain check endpoint with a known domain
    console.log('Testing domain check endpoint...');
    try {
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
          timeout: 10000
        }
      );
      
      diagnosticResults.domainCheckTest = {
        success: true,
        status: checkResponse.status,
        data: checkResponse.data
      };
      console.log('Domain check test successful');
    } catch (checkErr) {
      diagnosticResults.domainCheckTest = {
        success: false,
        error: checkErr.message,
        status: checkErr.response?.status,
        data: checkErr.response?.data
      };
      console.log('Domain check test failed');
    }
    
    res.json(diagnosticResults);
  } catch (err) {
    console.error('Diagnostic test failed:', err);
    res.status(500).json({
      error: 'Diagnostic test failed',
      details: err.message,
      partialResults: diagnosticResults
    });
  }
});

// Slack OAuth callback
app.get('/success', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Missing OAuth code or state.');
  }

  let parsedState;
  try {
    parsedState = JSON.parse(decodeURIComponent(state));
  } catch (err) {
    return res.status(400).send('Invalid state data.');
  }

  const { businessName, yourName, email } = parsedState;

  if (![businessName, yourName, email].every(field => field && field.trim() !== '')) {
    return res.status(400).send('Missing required info for channel creation.');
  }

  const channelName = `${businessName}-${yourName}`.toLowerCase().replace(/\s+/g, '-');

  try {
    const finalChannelId = await getOrCreateChannel(channelName);
    await inviteTeamMembers(finalChannelId);
    await inviteClientByEmail(finalChannelId, email);

    res.send(`<h2>Slack Channel "${channelName}" is Ready!</h2><p>You can now close this window.</p>`);
  } catch (err) {
    res.status(500).send('Failed to complete Slack channel setup.');
  }
});

// Helper function: Get or create channel
async function getOrCreateChannel(channelName) {
  try {
    const list = await web.conversations.list({ types: 'private_channel' });
    const existing = list.channels.find(c => c.name === channelName);

    if (existing) {
      return existing.id;
    }

    const created = await web.conversations.create({ name: channelName, is_private: true });
    return created.channel.id;
  } catch (err) {
    console.error('Failed to get or create channel:', err);
    throw err;
  }
}

// Helper function: Invite team members
async function inviteTeamMembers(channelId) {
  try {
    await web.conversations.invite({ channel: channelId, users: teamMembers.join(',') });
  } catch (err) {
    console.error('Failed to invite team members:', err);
  }
}

// Helper function: Invite client by email
async function inviteClientByEmail(channelId, slackEmail) {
  try {
    const userResult = await web.users.lookupByEmail({ email: slackEmail });
    await web.conversations.invite({ channel: channelId, users: userResult.user.id });
  } catch (err) {
    console.error('Failed to invite client:', err);
  }
}

// Create Slack channel
app.post('/api/create-slack-channel', async (req, res) => {
  const { channelName, businessName
