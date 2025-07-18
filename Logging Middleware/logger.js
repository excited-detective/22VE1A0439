const ACCESS_TOKEN = "PASTE_YOUR_BEARER_TOKEN_HERE";

async function log(level, package, message) {
  try {
    fetch("http://20.244.56.144/evaluation-service/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        stack: "backend",
        level: level,
        package: package,
        message: message,
      }),
    });
  } catch (error) {
    console.error("Logging failed:", error);
  }
}

module.exports = { log };
