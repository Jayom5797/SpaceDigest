const { Ollama } = require('ollama');

async function test() {
  console.log('Testing Ollama connection...\n');
  
  const ollama = new Ollama({ host: 'http://localhost:11434' });
  
  try {
    // List available models
    console.log('Checking installed models...');
    const models = await ollama.list();
    
    if (models.models.length === 0) {
      console.log('❌ No models installed!');
      console.log('\nTo install llama3.2:');
      console.log('1. Open Ollama app from system tray');
      console.log('2. Search for "llama3.2"');
      console.log('3. Click download');
      console.log('\nOR run: ollama pull llama3.2');
      return;
    }
    
    console.log(`✅ Found ${models.models.length} model(s):`);
    models.models.forEach(m => console.log(`  - ${m.name}`));
    
    // Test generation with first model
    const modelName = models.models[0].name;
    console.log(`\nTesting generation with ${modelName}...`);
    
    const response = await ollama.generate({
      model: modelName,
      prompt: 'Say "Hello, Ollama works!" in JSON format: {"message": "..."}',
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 50
      }
    });
    
    console.log('\n✅ SUCCESS! Ollama is working!');
    console.log('Response:', response.response);
    
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    console.error('\nMake sure:');
    console.error('1. Ollama app is running (check system tray)');
    console.error('2. At least one model is downloaded');
    console.error('3. Port 11434 is not blocked');
  }
}

test();
