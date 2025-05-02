require('dotenv').config(); // Load environment variables from .env file (for local testing)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { WebClient } = require('@slack/web-api');

const app = express();
const port = process.env.PORT || 3001; // Render sets the PORT environment variable

// --- Configuration ---
const PORKBUN_API_KEY = process.env.PORKBUN_API_KEY;
const PORKBUN_SECRET_KEY = process.env.PORKBUN_SECRET_KEY;
const PORKBUN_API_URL = 'https://api.porkbun.com/api/json/v3/domain/checkDomain';

// Get Slack Bot Token and Channel ID from environment variables
const slackBotToken = process.env.SLACK_BOT_TOKEN;
const targetChannelId = process.env.SLACK_CHANNEL_ID; // NEW: Get channel ID from env var

// --- Middleware ---
// Configure CORS to allow requests from anywhere - this is key for fixing your issue
app.use(cors({
  origin: '*',                // Allow any origin 
  methods: ['GET', 'POST'],   // Allow these methods
  allowedHeaders: '*',        // Allow any headers
  credentials: true           // Allow cookies
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Optional: Add body-parser for handling form submissions
app.use(express.urlencoded({ extended: true }));

// Initialize Slack WebClient
let slackClient;
if (!slackBotToken) {
  console.error('SLACK_BOT_TOKEN environment variable not set.');
} else {
  slackClient = new WebClient(slackBotToken);
}

if (!targetChannelId) {
  console.error('SLACK_CHANNEL_ID environment variable not set.');
  // Depending on your needs, you might block startup or just log the error
}

// --- Add request logging for debugging ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST') {
    console.log('Request body:', req.body);
  }
  next();
});

// --- Routes ---
app.post('/api/check-domain', async (req, res) => {
  const { domainName } = req.body;

  console.log(`Received check request for: ${domainName}`); // Log received domain

  if (!domainName) {
    return res.status(400).json({ error: 'Domain name is required' });
  }

  if (!PORKBUN_API_KEY || !PORKBUN_SECRET_KEY) {
    console.error('API keys are not configured on the server.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const url = `${PORKBUN_API_URL}${domainName}`;
  const payload = {
    apikey: PORKBUN_API_KEY,
    secretapikey: PORKBUN_SECRET_KEY
  };

  try {
    console.log(`Sending request to Porkbun: ${url}`);
    const porkbunResponse = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Porkbun response status:', porkbunResponse.status);
    console.log('Porkbun response data:', porkbunResponse.data);

    if (porkbunResponse.data && porkbunResponse.data.status === 'SUCCESS') {
      const isAvailable = porkbunResponse.data.response?.avail === 'yes';
      const priceString = porkbunResponse.data.response?.price;
      let meetsPriceCriteria = false;

      if (isAvailable && priceString) {
        try {
          const price = parseFloat(priceString);
          if (!isNaN(price) && price <= 15.00) {
            meetsPriceCriteria = true;
            console.log(`Domain ${domainName} price (${price}) meets criteria.`);
          } else {
            console.log(`Domain ${domainName} price (${price || 'N/A'}) exceeds $15 threshold.`);
          }
        } catch (e) {
          console.error(`Error parsing price: ${priceString}`, e);
          // Decide how to handle parsing errors - treat as not meeting criteria for safety?
        }
      }

      if (isAvailable && meetsPriceCriteria) {
        res.json({ available: true });
      } else if (isAvailable && !meetsPriceCriteria) {
        res.json({ available: false, reason: 'price' }); // Indicate price issue
      } else {
        res.json({ available: false }); // Domain is unavailable
      }
    } else {
      // Handle cases where Porkbun status is ERROR
      const errorMessage = porkbunResponse.data?.message || 'Unknown Porkbun API error';
      console.error('Porkbun API returned an error:', errorMessage);
      res.status(500).json({ error: `Failed to check domain: ${errorMessage}` });
    }

  } catch (error) {
    console.error('Error calling Porkbun API:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to check domain availability' });
  }
});

// --- Help/Slack Message Endpoints ---

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ status: 'success', message: 'Test endpoint working' });
});

app.post('/test', (req, res) => {
  console.log('Received test POST:', req.body);
  res.json({ status: 'success', message: 'Test POST received' });
});

// Endpoint to handle slack messages - FIXED to properly handle form submissions
app.post('/send-slack-message', async (req, res) => {
  console.log('Received slack message request with body:', req.body);
  
  try {
    // Check prerequisites
    if (!slackClient) {
      return res.status(500).json({ error: 'Slack client not initialized. Check SLACK_BOT_TOKEN.' });
    }
    
    if (!targetChannelId) {
      return res.status(500).json({ error: 'Target Slack channel not configured. Check SLACK_CHANNEL_ID.' });
    }

    // Get data from request body
    const { firstName, lastName, email, question } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !question) {
      return res.status(400).json({ 
        error: "Missing required fields", 
        received: req.body,
        required: ['firstName', 'lastName', 'email', 'question']
      });
    }

    // Format the message for Slack
    const messageText = `🆘 *Assistance Request* 🆘
*Name:* ${firstName} ${lastName}
*Email:* ${email}
*Question:*
>>>${question}`;

    try {
      // Call the chat.postMessage method using the WebClient
      const result = await slackClient.chat.postMessage({
        channel: targetChannelId, // Use the configured channel ID
        text: messageText,        // Use the formatted message
        mrkdwn: true              // Enable markdown formatting for better readability
      });

      console.log(`Assistance request sent successfully to channel ${targetChannelId}: ${result.ts}`);
      return res.status(200).json({ ok: true, message: 'Assistance request sent successfully', ts: result.ts });

    } catch (error) {
      console.error(`Error sending assistance request to channel ${targetChannelId}: ${error.data?.error || error.message}`);
      return res.status(500).json({ ok: false, error: error.data?.error || 'An internal server error occurred' });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
});

// Health check route (optional, but good practice)
app.get('/', (req, res) => {
  res.send('Porkbun Proxy is running!');
});

// --- Error Handling ---
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Server error', message: err.message });
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  if (!PORKBUN_API_KEY || !PORKBUN_SECRET_KEY) {
    console.warn('WARNING: Porkbun API keys are not set in environment variables!');
  }
});
