const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyADYYLYehjQ-6-28UHiPZGWgaD5u4PAKsA';
const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
  console.log('Testing Gemini API...');
  console.log('API Key:', apiKey.substring(0, 10) + '...');
  
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('Model created successfully');
    
    const result = await model.generateContent('Say hello in JSON format: {"message": "..."}');
    const response = result.response.text();
    console.log('Response:', response);
    console.log('\n✅ SUCCESS - Gemini API is working!');
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    console.error('Full error:', error);
  }
}

test();
