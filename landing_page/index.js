const app = require('./app');

// Port 8080 is standard for web landing pages
const PORT = 8080;

app.listen(PORT, '0.0.0.0', () => {
    console.log('--------------------------------------------');
    console.log('🚀 CU Orbit Landing Page is Live!');
    console.log(`🌍 URL: http://localhost:${PORT}`);
    console.log('📱 Mobile: Triggers Download');
    console.log('💻 Web: Shows "Coming Soon" message');
    console.log('--------------------------------------------');
});
