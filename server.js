// Add CORS support - place this near the top of your server.js file
// First, install cors with: npm install cors
const cors = require('cors');
app.use(cors());

// Add a test endpoint for diagnostics
app.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'API is working' });
});

// Make sure your existing endpoint is properly configured
// If you don't already have a route for /send-slack-help-message, add one like this:
app.post('/send-slack-help-message', async (req, res) => {
  try {
    console.log('Received help request:', req.body);
    
    // Your existing code to process the request and send to Slack
    // Just make sure it accepts the parameters from the form:
    // firstName, lastName, email, phone, message, businessName, context, userId
    
    // Send success response
    res.status(200).json({ success: true, message: 'Help request sent to Slack' });
  } catch (error) {
    console.error('Error handling help request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
