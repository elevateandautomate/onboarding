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

// API Credentials from environment variables
const API_KEY = process.env.PORKBUN_API_KEY || '';
const SECRET_KEY = process.env.PORKBUN_SECRET_KEY || '';
const SLACK_TOKEN = process.env.SLACK_TOKEN || '';
const SLACK_HELP_CHANNEL = process.env.SLACK_HELP_CHANNEL || 'client-help';

// Initialize Slack Web Client
const web = new WebClient(SLACK_TOKEN);

// Team members
const teamMembers = process.env.TEAM_MEMBERS ? 
                   process.env.TEAM_MEMBERS.split(',') : 
                   ['U08PKKX71A7', 'U08PKKUC4UB', 'U08P11AGCMD', 'U08P0JAJQQP'];

// Middleware
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
  
  if (!domainName || !domainName.includes('.')) {
    return res.status(400).json({ error: 'Invalid domain format' });
  }
  
  try {
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
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );
    
    const data = response.data;
    
    if (data.status === 'SUCCESS') {
      const isAvailable = data.available === '1';
      
      return res.json({
        available: isAvailable,
        domain: domainName,
        price: data.pricing?.registration || 'N/A',
        suggestions: isAvailable ? [] : generateAlternatives(domainName)
      });
    } else {
      return res.json({
        available: false,
        domain: domainName,
        error: data.message || 'Domain check failed',
        suggestions: generateAlternatives(domainName)
      });
    }
  } catch (err) {
    console.error('Error checking domain:', err.message);
    
    res.status(500).json({
      error: 'Failed to check domain availability',
      details: err.message
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
  const { channelName, businessName, userEmail } = req.body;
  
  if (!channelName) {
    return res.status(400).json({ error: 'Missing required parameter: channelName' });
  }
  
  try {
    const formattedChannelName = channelName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 80);
    
    const channelResult = await web.conversations.create({
      name: formattedChannelName,
      is_private: false
    });
    
    if (businessName && userEmail) {
      const welcomeMessage = `
New client onboarded!
Business Name: ${businessName}
Contact Email: ${userEmail}
Channel Created: ${new Date().toISOString()}
      `;
      
      await web.chat.postMessage({
        channel: channelResult.channel.id,
        text: welcomeMessage,
        parse: 'full'
      });
    }
    
    res.json({
      success: true,
      channelId: channelResult.channel.id,
      channelName: formattedChannelName
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to create Slack channel',
      details: err.message
    });
  }
});

// Send Slack message
app.post('/api/send-slack-message', async (req, res) => {
  const { channelId, message, blocks } = req.body;
  
  if (!channelId || (!message && !blocks)) {
    return res.status(400).json({
      error: 'Missing required parameters: channelId and either message or blocks'
    });
  }
  
  try {
    const messageParams = {
      channel: channelId,
      text: message || 'New message from API'
    };
    
    if (blocks) {
      messageParams.blocks = blocks;
    }
    
    const result = await web.chat.postMessage(messageParams);
    
    res.json({
      success: true,
      messageTs: result.ts,
      channelId: result.channel
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to send Slack message',
      details: err.message
    });
  }
});

// Send help request to Slack
app.post('/api/send-slack-help-message', async (req, res) => {
  const { firstName, lastName, email, phone, message, businessName } = req.body;
  
  if (!firstName || !lastName || !email || !message) {
    return res.status(400).json({
      error: 'Missing required parameters: firstName, lastName, email, message'
    });
  }
  
  try {
    const helpText = `
Help request from ${firstName} ${lastName}
Email: ${email}
Phone: ${phone || 'Not provided'}
Business: ${businessName || 'Not provided'}
Message: ${message}
    `;
    
    const result = await web.chat.postMessage({
      channel: SLACK_HELP_CHANNEL,
      text: helpText
    });
    
    res.json({
      success: true,
      messageTs: result.ts
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to send help message',
      details: err.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server URL: http://localhost:${PORT}`);
});
