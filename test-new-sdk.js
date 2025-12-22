const { GoogleGenAI } = require('@google/genai');

const apiKey = 'AIzaSyADYYLYehjQ-6-28UHiPZGWgaD5u4PAKsA';
const genAI = new GoogleGenAI({ apiKey });

async function test() {
  console.log('Testing NEW Gemini SDK...');
  
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Say hello in JSON format: {"message": "..."}'
    });
    
    console.log('Response:', response.text);
    console.log('\n✅ SUCCESS - New SDK works!');
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    console.error('Full error:', error);
  }
}

test();
