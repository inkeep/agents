#!/usr/bin/env node

import http from 'node:http';
import { checkForRoutes } from './check-mcps.js';

const colors = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

const { green, blue, cyan, yellow, magenta, red, bold, dim, reset } = colors;

const services = [
  {
    name: 'Management Dashboard',
    emoji: '🎨',
    color: green,
    url: 'http://localhost:3000',
    port: 3000,
    description: 'Web interface for agent management',
    healthEndpoint: '/',
  },
  {
    name: 'Management API',
    emoji: '🚀',
    color: blue,
    url: 'http://localhost:3002',
    port: 3002,
    description: 'Manage agents and configurations',
    healthEndpoint: '/health',
  },
  {
    name: 'Run API',
    emoji: '⚡',
    color: yellow,
    url: 'http://localhost:3003',
    port: 3003,
    description: 'Execute agents and handle requests',
    healthEndpoint: '/health',
  },
];

if (await checkForRoutes()) {
  services.push({
    name: 'MCP Service',
    emoji: '🔗',
    color: magenta,
    url: 'http://localhost:3006',
    port: 3006,
    description: 'Custom MCP Servers',
    healthEndpoint: '/',
  });
}

async function checkServiceHealth(service) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.request(
      {
        hostname: 'localhost',
        port: service.port,
        path: service.healthEndpoint,
        method: 'GET',
        timeout: 2000,
      },
      (res) => {
        const responseTime = Date.now() - startTime;
        resolve({
          status: 'healthy',
          responseTime,
          statusCode: res.statusCode,
        });
        req.destroy();
      }
    );

    req.on('error', () => {
      resolve({
        status: 'unhealthy',
        responseTime: null,
        statusCode: null,
      });
    });

    req.on('timeout', () => {
      resolve({
        status: 'timeout',
        responseTime: null,
        statusCode: null,
      });
      req.destroy();
    });

    req.end();
  });
}

function getStatusIndicator(health) {
  switch (health.status) {
    case 'healthy':
      return `${green}●${reset}`;
    case 'unhealthy':
      return `${red}●${reset}`;
    case 'timeout':
      return `${yellow}●${reset}`;
    default:
      return `${dim}●${reset}`;
  }
}

function getStatusText(health) {
  switch (health.status) {
    case 'healthy':
      return `${green}HEALTHY${reset}`;
    case 'unhealthy':
      return `${red}DOWN${reset}`;
    case 'timeout':
      return `${yellow}TIMEOUT${reset}`;
    default:
      return `${dim}UNKNOWN${reset}`;
  }
}

function getResponseTimeText(health) {
  if (health.responseTime !== null) {
    const time = health.responseTime;
    if (time < 100) {
      return `${green}${time}ms${reset}`;
    }
    if (time < 500) {
      return `${yellow}${time}ms${reset}`;
    }
    return `${red}${time}ms${reset}`;
  }
  return `${dim}--${reset}`;
}

let isFirstRender = true;
let startRow = 1;

async function showServicesWithHealthCheck(clearScreen = true) {
  // Check health of all services in parallel
  const healthPromises = services.map((service) =>
    checkServiceHealth(service).then((health) => ({ service, health }))
  );

  const results = await Promise.all(healthPromises);
  const healthyCount = results.filter((r) => r.health.status === 'healthy').length;

  // Get current time
  const now = new Date();
  const timeStr = now.toLocaleTimeString();

  // Use absolute cursor positioning for reliable in-place updates
  if (!isFirstRender && clearScreen) {
    // Move cursor to the saved starting row and clear from there
    process.stdout.write(`\x1b[${startRow};1H`); // Move to row startRow, column 1
    process.stdout.write('\x1b[0J'); // Clear from cursor down
  } else if (isFirstRender) {
    // On first render, get current cursor position
    // Since we can't easily read cursor position, we'll clear screen and start from top
    process.stdout.write('\x1b[2J'); // Clear entire screen
    process.stdout.write('\x1b[1;1H'); // Move to top-left (row 1, column 1)
    startRow = 1;
    isFirstRender = false;
  }

  console.log('');
  console.log(
    `${green}${bold}╔══════════════════════════════════════════════════════════════════════════════════╗${reset}`
  );
  console.log(
    `${green}${bold}║                                                                                  ║${reset}`
  );
  console.log(
    `${green}${bold}║                                  INKEEP AGENTS                                   ║${reset}`
  );
  console.log(
    `${green}${bold}║                                                                                  ║${reset}`
  );

  // Add last updated time
  const updateLine = `Last status check: ${timeStr}`;
  const updatePadding = Math.max(0, 80 - updateLine.length);
  console.log(
    `${green}${bold}║${' '.repeat(Math.floor(updatePadding / 2))}${dim}${updateLine}${reset}${green}${bold}${' '.repeat(Math.ceil(updatePadding / 2))}  ║${reset}`
  );

  console.log(
    `${green}${bold}║                                                                                  ║${reset}`
  );
  console.log(
    `${green}${bold}╠══════════════════════════════════════════════════════════════════════════════════╣${reset}`
  );
  console.log(
    `${green}${bold}║                                                                                  ║${reset}`
  );

  // Display each service with health status
  for (const { service, health } of results) {
    // Create plain text version first for accurate length calculation
    const statusPlain =
      health.status === 'healthy' ? 'HEALTHY' : health.status === 'timeout' ? 'TIMEOUT' : 'DOWN';

    // Build plain text line WITHOUT emoji first
    const lineWithoutEmoji = `  ${service.name}    →  ${service.url}  ● ${statusPlain}`;
    // Calculate padding: 80 - (line length without emoji + 1 for space after emoji + 1 for emoji displayed as 2 chars)
    const visibleLength = lineWithoutEmoji.length + 2; // +2 because emoji takes 2 character widths
    const padding = Math.max(0, 80 - visibleLength);

    // Build the line with proper padding
    const plainLine = `  ${service.emoji} ${service.name}    →  ${service.url}  ● ${statusPlain}${' '.repeat(padding)}`;

    // Now apply colors to the line
    let coloredLine = `${green}${bold}║${plainLine} ${green}${bold}║${reset}`;
    coloredLine = coloredLine.replace(
      service.name,
      `${service.color}${bold}${service.name}${reset}${green}${bold}`
    );
    coloredLine = coloredLine.replace(service.url, `${cyan}${service.url}${reset}${green}${bold}`);
    coloredLine = coloredLine.replace('●', getStatusIndicator(health));
    coloredLine = coloredLine.replace(statusPlain, getStatusText(health));

    console.log(coloredLine);
    console.log(
      `${green}${bold}║     ${dim}• ${service.description}${reset}${green}${bold}${' '.repeat(Math.max(0, 74 - service.description.length))} ${green}${bold}║${reset}`
    );
    console.log(
      `${green}${bold}║                                                                                  ║${reset}`
    );
  }

  console.log(
    `${green}${bold}╚══════════════════════════════════════════════════════════════════════════════════╝${reset}`
  );
  console.log('');

  // Show legend
  console.log(
    `${dim}  Status: ${green}● HEALTHY${reset}${dim}  ${yellow}● TIMEOUT${reset}${dim}  ${red}● DOWN${reset}`
  );
  console.log(
    `${dim}  💡 Tip: Press ${reset}${cyan}q${reset} then ${cyan}Ctrl+C${reset}${dim} to exit${reset}`
  );
  console.log(`${dim}  💡 Learn more: ${reset}${cyan}https://docs.inkeep.com/overview${reset}`);
  console.log('');
}

// Check for watch mode flag
const args = process.argv.slice(2);
const watchMode = args.includes('--watch') || args.includes('-w');
const rapidInterval = 1000; // Check every second initially
const normalInterval = 300000; // Update every 5 minutes after startup
const rapidCheckDuration = 5000; // Do rapid checks for first 5 seconds

if (watchMode) {
  console.log(`${cyan}${bold}Starting continuous monitoring mode...${reset}`);

  // Initial display
  showServicesWithHealthCheck().catch(console.error);

  // Set up rapid interval for first 5 seconds
  const rapidIntervalId = setInterval(() => {
    showServicesWithHealthCheck().catch(console.error);
  }, rapidInterval);

  // After 5 seconds, switch to normal interval
  setTimeout(() => {
    clearInterval(rapidIntervalId);
    setInterval(() => {
      showServicesWithHealthCheck().catch(console.error);
    }, normalInterval);
  }, rapidCheckDuration);
} else {
  // Single check mode
  showServicesWithHealthCheck(false).catch(console.error);
}
