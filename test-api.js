/**
 * Quick test to diagnose Delta Exchange API connection
 * Run: node test-api.js
 */
const db = require('./database');
const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://api.india.delta.exchange';

async function test() {
    // 1. Read stored credentials
    const apiKey = db.getEncryptedSetting('api_key');
    const apiSecret = db.getEncryptedSetting('api_secret');
    
    console.log('\n========== DELTA API DIAGNOSTIC ==========');
    console.log(`API Key: "${apiKey}"`);
    console.log(`API Key length: ${apiKey ? apiKey.length : 'null'}`);
    console.log(`API Key hex: ${apiKey ? Buffer.from(apiKey).toString('hex') : 'null'}`);
    console.log(`API Secret: "${apiSecret ? apiSecret.substring(0, 6) + '...' : 'null'}"`);
    console.log(`API Secret length: ${apiSecret ? apiSecret.length : 'null'}`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log('==========================================\n');

    if (!apiKey || !apiSecret) {
        console.log('❌ No API credentials found. Save them in Settings first.');
        process.exit(1);
    }

    // 2. Test PUBLIC endpoint first (no auth needed)
    console.log('--- Test 1: Public endpoint (no auth) ---');
    try {
        const publicRes = await axios.get(`${BASE_URL}/v2/tickers/BTCUSD`, { timeout: 10000 });
        console.log(`✅ Public API works. BTC price: ${publicRes.data?.result?.mark_price || 'N/A'}`);
    } catch (e) {
        console.log(`❌ Public API failed: ${e.message}`);
        if (e.response) console.log('Response:', JSON.stringify(e.response.data));
    }

    // 3. Test PRIVATE endpoint (auth required)
    console.log('\n--- Test 2: Private endpoint (with auth) ---');
    
    const method = 'GET';
    const path = '/v2/wallet/balances';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const queryString = '';
    const body = '';
    
    const message = method + timestamp + path + queryString + body;
    const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
    
    console.log(`Timestamp: ${timestamp}`);
    console.log(`Prehash message: "${message}"`);
    console.log(`Signature: ${signature}`);
    
    const headers = {
        'api-key': apiKey,
        'signature': signature,
        'timestamp': timestamp,
        'User-Agent': 'CryptoBOT/1.0',
        'Content-Type': 'application/json'
    };
    
    console.log(`Headers:`, JSON.stringify(headers, null, 2));
    
    try {
        const privateRes = await axios.get(`${BASE_URL}${path}`, { headers, timeout: 10000 });
        console.log(`✅ AUTH SUCCESS! Wallet balances:`, JSON.stringify(privateRes.data?.result?.slice(0, 3), null, 2));
    } catch (e) {
        console.log(`❌ AUTH FAILED: ${e.message}`);
        if (e.response) {
            console.log(`Status: ${e.response.status}`);
            console.log(`Full Response Body:`, JSON.stringify(e.response.data, null, 2));
            
            // Check if Delta gives us the expected signature_data
            if (e.response.data?.error?.context?.signature_data) {
                const serverExpected = e.response.data.error.context.signature_data;
                console.log(`\n⚠️  Server expected signature_data: "${serverExpected}"`);
                console.log(`    Our prehash message:            "${message}"`);
                console.log(`    MATCH: ${serverExpected === message ? '✅ YES' : '❌ NO - THIS IS THE PROBLEM'}`);
            }
        }
    }
    
    console.log('\n========== DIAGNOSTIC COMPLETE ==========\n');
    db.close();
}

test().catch(e => {
    console.error('Test failed:', e);
    db.close();
});
