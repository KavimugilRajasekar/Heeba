try {
  console.log('Loading intent-executor...');
  require('../src/core/intent-executor');
  console.log('Loaded intent-executor.');
  
  console.log('Loading web-launcher...');
  require('../src/web/web-launcher');
  console.log('Loaded web-launcher.');
  
  console.log('Loading telegram-launcher...');
  require('../src/telegram/telegram-launcher');
  console.log('Loaded telegram-launcher.');

} catch (e) {
  console.error('CRASH DETECTED:');
  console.error(e);
}
