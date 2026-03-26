const helpers = require('./lib/helpers');
const {
  connectToLocalBrowser,
  getConnectedPage,
  extractAuthState,
} = require('./lib/local-browser');

(async () => {
  let connection;
  try {
    console.log('Connecting to Chrome via Playwright MCP Bridge extension...');
    connection = await connectToLocalBrowser();
    const { browser, context, page } = connection;
    console.log('Connected to Chrome. Page ready.\n');

    await page.goto('https://example.com');
    console.log('Via run.js --connect:', await page.title());
  } catch (error) {
    console.error('Automation error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (connection) await connection.close();
  }
})();
