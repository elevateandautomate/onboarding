import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { WebClient } from '@slack/web-api';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Porkbun API Credentials
const API_KEY = process.env.PORKBUN_API_KEY;
const SECRET_KEY = process.env.PORKBUN_SECRET_KEY;

// ✅ Slack API Credentials
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const slack = new WebClient(SLACK_BOT_TOKEN);

// 👥 Internal Team Slack User IDs to automatically add to channels
// Example: TEAM_MEMBERS=U08P11AGCMD,U08PKKUC4UB,U08PKKX71A7,U08P0JAJQQP
const TEAM_MEMBERS = process.env.TEAM_MEMBERS ? process.env.TEAM_MEMBERS.split(',') : [];

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
   🤖 API: Create Slack Channel
========================================= */
app.post('/api/create-slack-channel', async (req, res) => {
  const { channelName, userEmail, businessName, clientName } = req.body;
  console.log(`📝 Received Slack channel creation request for: ${channelName}`);

  // Validate input
  if (!channelName || !userEmail) {
    console.log('❌ Invalid Slack channel request - missing required fields');
    return res.status(400).json({
      error: '❌ Please provide both channelName and userEmail',
      details: 'Both fields are required to create a Slack channel'
    });
  }

  try {
    console.log(`✅ Creating Slack channel: ${channelName}`);
    console.log(`✅ User email: ${userEmail}`);
    console.log(`✅ Business name: ${businessName || 'Not provided'}`);
    console.log(`✅ Client name: ${clientName || 'Not provided'}`);

    // Validate channel name according to Slack requirements
    // Slack channel names can only contain lowercase letters, numbers, hyphens, and underscores
    // and must be 80 characters or less
    const sanitizedChannelName = channelName
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .substring(0, 80);

    if (sanitizedChannelName !== channelName) {
      console.log(`⚠️ Channel name sanitized from "${channelName}" to "${sanitizedChannelName}"`);
    }

    // First test the token to ensure it's valid
    console.log(`🔄 Testing Slack token before channel creation`);
    try {
      const authTest = await slack.auth.test();
      console.log(`✅ Slack token is valid. Connected as: ${authTest.user} in team: ${authTest.team}`);
    } catch (authError) {
      console.error('❌ Slack token validation failed:', authError);

      const slackError = authError.data?.error || authError.message || 'unknown error';

      throw new Error(`Slack authentication failed: ${slackError}`);
    }

    // 1. Create the channel or find existing one
    console.log(`🔄 Creating private Slack channel: ${sanitizedChannelName}`);
    let channelId;
    try {
      // Try to create the channel
      const channelResult = await slack.conversations.create({
        name: sanitizedChannelName,
        is_private: true
      });

      if (!channelResult.ok) {
        throw new Error(`Failed to create channel: ${channelResult.error}`);
      }

      channelId = channelResult.channel.id;
      console.log(`✅ Channel created with ID: ${channelId}`);
    } catch (channelError) {
      // Check if error is because channel already exists
      const slackError = channelError.data?.error || channelError.message || 'unknown error';

      if (slackError === 'name_taken') {
        console.log(`⚠️ Channel "${sanitizedChannelName}" already exists. Trying to find it...`);

        try {
          // List all private channels
          const listResult = await slack.conversations.list({
            types: 'private_channel',
            exclude_archived: true
          });

          // Find the channel with the matching name
          const existingChannel = listResult.channels.find(channel => channel.name === sanitizedChannelName);

          if (existingChannel) {
            channelId = existingChannel.id;
            console.log(`✅ Found existing channel with ID: ${channelId}`);
          } else {
            // If we can't find it, create a new channel with a timestamp suffix
            const timestampSuffix = Math.floor(Date.now() / 1000).toString().slice(-4);
            const newChannelName = `${sanitizedChannelName}-${timestampSuffix}`;

            console.log(`🔄 Creating channel with unique name: ${newChannelName}`);
            const newChannelResult = await slack.conversations.create({
              name: newChannelName,
              is_private: true
            });

            channelId = newChannelResult.channel.id;
            console.log(`✅ Created channel with unique name and ID: ${channelId}`);
          }
        } catch (findError) {
          console.error('❌ Error finding or creating alternative channel:', findError);
          throw new Error(`Could not create or find channel: ${findError.message}`);
        }
      } else {
        // If it's a different error, throw it
        console.error('❌ Channel creation failed:', channelError);
        throw new Error(`Slack API error: ${slackError}`);
      }
    }

    // 2. Invite team members to the channel
    if (TEAM_MEMBERS.length > 0) {
      console.log(`🔄 Inviting team members to channel: ${channelId}`);
      try {
        // Join team members into comma-separated string for the API
        const teamMembersString = TEAM_MEMBERS.join(',');

        await slack.conversations.invite({
          channel: channelId,
          users: teamMembersString
        });
        console.log(`✅ Team members invited to channel: ${TEAM_MEMBERS.join(', ')}`);
      } catch (teamError) {
        console.warn(`⚠️ Could not invite team members: ${teamError.message}`);
        // Continue even if team member invitation fails
      }
    } else {
      console.log('ℹ️ No team members configured to invite automatically');
    }

    // 3. Find the user by email
    console.log(`🔄 Looking up user by email: ${userEmail}`);
    try {
      const userLookup = await slack.users.lookupByEmail({
        email: userEmail
      });

      if (userLookup.ok && userLookup.user) {
        const userId = userLookup.user.id;
        console.log(`✅ Found user with ID: ${userId}`);

        // 4. Add the user to the channel
        console.log(`🔄 Adding user ${userId} to channel ${channelId}`);
        await slack.conversations.invite({
          channel: channelId,
          users: userId
        });
        console.log(`✅ User added to channel`);
      } else {
        console.log(`⚠️ User with email ${userEmail} not found in Slack workspace`);
      }
    } catch (userError) {
      console.warn(`⚠️ Could not find or add user: ${userError.message}`);
      // Continue with channel creation even if user lookup fails
    }

    // 5. Send a welcome message to the channel
    const welcomeMessage = `
:wave: Welcome to your dedicated support channel!

*Business:* ${businessName || 'Not provided'}
*Contact:* ${clientName || 'Not provided'}
*Email:* ${userEmail}

Our team will be with you shortly to help with your onboarding process. Feel free to ask any questions here!
    `;

    try {
      await slack.chat.postMessage({
        channel: channelId,
        text: welcomeMessage,
        parse: 'full'
      });
      console.log(`✅ Welcome message posted to channel`);
    } catch (messageError) {
      console.warn(`⚠️ Could not post welcome message: ${messageError.message}`);
      // Continue with success response even if welcome message fails
    }

    // Return success response
    return res.json({
      success: true,
      channelId: channelId,
      channelName: channelName,
      message: 'Slack channel created successfully',
      note: 'You will be invited to the channel shortly'
    });
  } catch (err) {
    console.error(`❌ Error in /api/create-slack-channel endpoint: ${err.message}`);

    // Send a more detailed error response
    res.status(500).json({
      error: 'Failed to create Slack channel.',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

/* =========================================
   � Find Slack User ID by Email
========================================= */
app.get('/find-user-id', async (req, res) => {
  console.log('🔍 Looking up Slack user ID by email');

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({
      error: 'Missing email parameter',
      example: '/find-user-id?email=user@example.com'
    });
  }

  try {
    console.log(`🔍 Looking up user with email: ${email}`);
    const result = await slack.users.lookupByEmail({
      email: email
    });

    if (result.ok && result.user) {
      console.log(`✅ Found user: ${result.user.name} with ID: ${result.user.id}`);
      res.json({
        status: 'success',
        user: {
          id: result.user.id,
          name: result.user.name,
          real_name: result.user.real_name,
          email: result.user.profile.email
        },
        note: 'Add this ID to your TEAM_MEMBERS environment variable'
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'User not found',
        email: email
      });
    }
  } catch (err) {
    console.error('❌ Error looking up user:', err);

    const errorResponse = {
      status: 'error',
      message: 'Failed to look up user',
      error: err.data?.error || err.message,
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

/* =========================================
   � Test Slack Token
========================================= */
app.get('/test-slack-token', async (req, res) => {
  console.log('🔍 Testing Slack token');

  try {
    // Test the token
    const result = await slack.auth.test();

    console.log(`✅ Slack token test successful: ${JSON.stringify(result)}`);
    res.json({
      status: 'success',
      message: 'Slack token is valid',
      team: result.team,
      user: result.user,
      botId: result.bot_id
    });
  } catch (err) {
    console.error('❌ Slack token test failed:', err);

    const slackError = err.data?.error || err.message || 'unknown error';

    const errorResponse = {
      status: 'error',
      message: 'Slack token test failed',
      error: slackError,
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

/* =========================================
   � Slack OAuth Endpoints
========================================= */
// Main OAuth endpoint
app.get('/slack/oauth', async (req, res) => {
  console.log('🔄 Received Slack OAuth request');
  console.log('Query parameters:', req.query);

  const { code } = req.query;

  if (!code) {
    console.error('❌ No authorization code received');
    return res.status(400).send('Missing authorization code');
  }

  try {
    // For a complete OAuth implementation, you would exchange the code for a token here
    // For now, we'll just redirect to the success page
    console.log('✅ Received authorization code, redirecting to success page');
    res.redirect('/success');
  } catch (err) {
    console.error('❌ Error in OAuth process:', err);
    res.status(500).send('An error occurred during the OAuth process. Please try again.');
  }
});

// Success callback
app.get('/success', async (req, res) => {
  console.log('🔄 Received OAuth success callback');
  console.log('Query parameters:', req.query);

  try {
    // You can process OAuth code here if needed
    // For now, just return a success page
    res.send(`
      <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              margin-top: 50px;
            }
            .success {
              color: #2eb67d;
              font-size: 24px;
              margin-bottom: 20px;
            }
            .message {
              font-size: 18px;
              margin-bottom: 30px;
            }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Authorization Successful!</h1>
          <p class="message">Your Slack app has been successfully authorized.</p>
          <p>You can now close this window and return to your application.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Error in OAuth success callback:', err);
    res.status(500).send('An error occurred during the OAuth process. Please try again.');
  }
});

/* =========================================
   �🚀 Start Server
========================================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 Using API key: ${API_KEY.substring(0, 10)}...`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📝 API Endpoints:`);
  console.log(`   - POST /api/check-domain`);
  console.log(`   - POST /api/create-slack-channel`);
  console.log(`   - GET /ping`);
  console.log(`   - GET /my-ip`);
  console.log(`   - GET /test-keys`);
  console.log(`   - GET /test-slack-token`);
  console.log(`   - GET /find-user-id`);
  console.log(`   - GET /slack/oauth`);
  console.log(`   - GET /success`);
});
