// Teste rápido para verificar endpoints de debug
const testEndpoints = async () => {
  const baseUrl = 'http://localhost:3001/api';
  
  console.log('Testing debug endpoints...');
  
  // Test status endpoint
  try {
    const response = await fetch(`${baseUrl}/debug/status`);
    const data = await response.json();
    console.log('✅ Status endpoint working:', data);
  } catch (error) {
    console.error('❌ Status endpoint failed:', error.message);
  }
  
  // Test logs endpoint
  try {
    const response = await fetch(`${baseUrl}/debug/logs`);
    const data = await response.json();
    console.log('✅ Logs endpoint working:', data);
  } catch (error) {
    console.error('❌ Logs endpoint failed:', error.message);
  }
  
  // Test posting a log
  try {
    const response = await fetch(`${baseUrl}/debug/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'info',
        message: 'Test log from frontend',
        data: { test: true },
        source: 'test'
      })
    });
    const data = await response.json();
    console.log('✅ Log post endpoint working:', data);
  } catch (error) {
    console.error('❌ Log post endpoint failed:', error.message);
  }
};

// Run test
testEndpoints();
