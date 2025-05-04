// Check domain availability with enhanced error handling and diagnostics
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
