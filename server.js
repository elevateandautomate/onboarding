require('dotenv').config(); // Load environment variables from .env file (for local testing)
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001; // Render sets the PORT environment variable

// --- Configuration ---
const PORKBUN_API_KEY = process.env.PORKBUN_API_KEY;
const PORKBUN_SECRET_KEY = process.env.PORKBUN_SECRET_KEY;
const PORKBUN_API_URL = 'https://api.porkbun.com/api/json/v3/domain/check/';

// --- Middleware ---
app.use(cors()); // Enable CORS for all origins (adjust for production if needed)
app.use(express.json()); // Middleware to parse JSON bodies

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
            res.json({ available: isAvailable });
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

// Health check route (optional, but good practice)
app.get('/', (req, res) => {
    res.send('Porkbun Proxy is running!');
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Porkbun proxy server listening on port ${port}`);
    if (!PORKBUN_API_KEY || !PORKBUN_SECRET_KEY) {
        console.warn('WARNING: Porkbun API keys are not set in environment variables!');
    }
});
