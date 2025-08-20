// health-check.js
const http = require("http");

const options = {
  hostname: "localhost",
  port: 4000,
  path: "/health",
  timeout: 2000,
};

const request = http.request(options, (res) => {
  console.log(`Health check status: ${res.statusCode}`);
  process.exit(res.statusCode === 200 ? 0 : 1);
});

request.on("error", (err) => {
  console.error("Health check failed:", err.message);
  process.exit(1);
});

request.on("timeout", () => {
  console.error("Health check timeout");
  request.destroy();
  process.exit(1);
});

request.end();
