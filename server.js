const { WebClient } = require('@slack/web-api');
require('dotenv').config();

const token = process.env.SLACK_BOT_TOKEN;
const channelId = process.env.SLACK_CHANNEL_ID;

const web = new WebClient(token);

async function sendMessage(text) {
  try {
    await web.chat.postMessage({
      channel: channelId,
      text: text,
    });
    console.log('Message sent successfully');
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

sendMessage('Hello from my Slack bot!');
