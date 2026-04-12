const { queryLLM } = require('../src/core/engine');
const { state } = require('../src/core/state-manager');

async function test() {
  console.log('Testing LLM query...');
  try {
    const response = await queryLLM("Just say 'HEEBA OK'", 'auto', state.CONFIG, null);
    console.log('Response:', response);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
