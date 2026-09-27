import http from "http";
import assert from "assert";

const API_BASE = process.env.TEST_API_URL || "http://localhost:5001/api";

export async function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const reqOptions = {
      method: options.method || "GET",
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data, body: {} });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

export async function ensureServerReady() {
  try {
    const res = await request("/health");
    if (res.status === 200 && res.body?.status === "ok") {
      return true;
    }
  } catch (err) {
    console.error(`⚠️ Server at ${API_BASE} is not reachable. Make sure backend is running.`);
    throw new Error(`Backend server not reachable at ${API_BASE}. Run 'npm run dev' or 'node backend/server.js'.`);
  }
  return true;
}

export { assert };
