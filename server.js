const express = require('express');
const cors = require('cors');
const { WebClient } = require('@slack/web-api');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Slack setup
const token = process.env.SLACK_BOT_TOKEN;
const channelId = process.env.SLACK_CHANNEL_ID;
const web = new WebClient(token);

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies

// Routes
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ status: 'success', message: 'Test endpoint working' });
});

app.post('/test', (req, res) => {
  console.log('Received test POST:', req.body);
  res.json({ status: 'success', message: 'Test POST received' });
});

// Endpoint to handle the help form submissions
app.post('/send-slack-help-message', async (req, res) => {
  console.log('Received help request:', req.body);
  
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phone,
      message, 
      businessName,
      userId,
      timestamp
    } = req.body;
    
    // Format a nice Slack message with the form data
    const slackMessage = `
:bell: *New Help Request*
*Business:* ${businessName || 'Not specified'}
*From:* ${firstName} ${lastName}
*Email:* ${email}
*Phone:* ${phone || 'Not provided'}
*User ID:* ${userId || 'Not available'}
*Time:* ${new Date(timestamp).toLocaleString()}

*Message:*
>${message}
`;
    
    // Send to Slack
    await web.chat.postMessage({
      channel: channelId,
      text: slackMessage,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: slackMessage
          }
        }
      ]
    });
    
    console.log('Help request sent to Slack successfully');
    res.json({ success: true, message: 'Help request sent to Slack' });
    
  } catch (error) {
    console.error('Error sending help request to Slack:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send help request to Slack',
      error: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
