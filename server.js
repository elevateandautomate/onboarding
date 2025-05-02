// Add this route right above your existing /send-slack-message route
app.post('/send-slack-message', async (req, res) => {
  console.log('Received help message POST request');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  // Check if we have JSON data field (from the form)
  let data = req.body;
  if (req.body.json_data) {
    try {
      // Parse the JSON string from the form
      data = JSON.parse(req.body.json_data);
      console.log('Parsed JSON data:', data);
    } catch (err) {
      console.error('Error parsing JSON data:', err);
    }
  }
  
  // Extract values with fallbacks
  const firstName = data.firstName || '';
  const lastName = data.lastName || '';
  const email = data.email || '';
  const question = data.question || '';
  const channelId = data.channel_id || process.env.SLACK_CHANNEL_ID || targetChannelId;
  
  console.log('Using channel ID:', channelId);
  
  // Rest of your existing code...
  if (!slackClient) {
    return res.status(500).json({ error: 'Slack client not initialized' });
  }
  
  if (!channelId) {
    return res.status(400).json({ error: "Missing 'channel_id' in request body" });
  }
  
  try {
    // Format the message for Slack
    const messageText = `🆘 *Help Request* 🆘
    *Name:* ${firstName} ${lastName}
    *Email:* ${email}
    *Question:*
    >>>${question}`;
    
    // Send to Slack
    const result = await slackClient.chat.postMessage({
      channel: channelId,
      text: messageText,
      mrkdwn: true
    });
    
    console.log('Message sent to Slack successfully');
    return res.json({ ok: true, message: 'Help request sent successfully' });
  } catch (error) {
    console.error('Error sending to Slack:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});
