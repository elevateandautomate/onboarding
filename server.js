// Add this route to your server.js
app.post('/', (req, res) => {
  console.log('Received POST to root URL:', req.body);
  
  // Log everything about this request
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Query:', req.query);
  
  // Always return success
  res.json({ 
    success: true, 
    message: 'Request received',
    receivedData: req.body
  });
  
  // If you have Slack configured, try to send a simple message
  if (slackClient && targetChannelId) {
    try {
      slackClient.chat.postMessage({
        channel: targetChannelId,
        text: `Test message from root endpoint: ${JSON.stringify(req.body)}`
      });
      console.log('Sent test message to Slack');
    } catch (err) {
      console.error('Error sending to Slack:', err);
    }
  }
});
