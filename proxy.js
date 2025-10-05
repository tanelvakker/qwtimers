const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const http2 = require("http2");

const API_TARGET = "https://app.qilowatt.it";
const API_AUTHORITY = "app.qilowatt.it";

const app = express();

const fs = require("fs");
const os = require("os");
const path = require("path");
const LOG_DIR = os.tmpdir();
const LOG_FILE = path.join(LOG_DIR, "proxy-debug.log");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
console.log("Logging proxy debug to", LOG_FILE);

const cookieJar = new Map();

function storeCookiesFromSetCookie(setCookieHeader) {
  if (!setCookieHeader) {
    return;
  }

  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  cookies
    .filter(Boolean)
    .forEach((cookie) => {
      const [pair] = cookie.split(";", 1);
      if (!pair) {
        return;
      }

      const [name, value] = pair.split("=", 2);
      if (!name || value === undefined) {
        return;
      }

      cookieJar.set(name.trim(), value.trim());
    });
}

function cookieJarToString() {
  if (cookieJar.size === 0) {
    return "";
  }

  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function buildCookieHeader(incomingCookieHeader) {
  const jarString = cookieJarToString();
  if (jarString && incomingCookieHeader) {
    return `${incomingCookieHeader}; ${jarString}`;
  }

  return jarString || incomingCookieHeader || "";
}

function handleProxyReq(proxyReq, req) {
  console.log("proxyReq", req.method, req.originalUrl, "host", proxyReq.getHeader("host"));
  const line = `Proxying ${req.method} ${req.originalUrl} -> ${proxyReq.path} (host=${proxyReq.getHeader("host")})\n`;
  fs.appendFileSync(LOG_FILE, line);
  const forwardAuth = req.originalUrl?.startsWith("/api/");
  if (forwardAuth) {
    const authHeader = req.headers["authorization"];
    if (authHeader) {
      proxyReq.setHeader("authorization", authHeader);
    }
  } else {
    proxyReq.removeHeader("authorization");
  }

  const cookieHeader = buildCookieHeader(req.headers.cookie);
  if (cookieHeader) {
    proxyReq.setHeader("cookie", cookieHeader);
  }
}

function handleProxyRes(proxyRes, req) {
  console.log("proxyRes", proxyRes.statusCode, req.originalUrl);
  const line = `Response ${proxyRes.statusCode} for ${req.method} ${req.originalUrl}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

app.use("/api", (req, res, next) => {
  console.log("Express saw", req.method, req.originalUrl);
  next();
});

function buildStandardProxyConfig() {
  return {
    target: API_TARGET,
    changeOrigin: true,
    logLevel: "debug",
    on: {
      proxyReq: handleProxyReq,
      proxyRes: handleProxyRes,
    },
  };
}

app.post("/api/user/login", express.urlencoded({ extended: false }), async (req, res) => {
  const client = http2.connect(API_TARGET);
  let responseHeaders = {};
  const chunks = [];

  client.on("error", (err) => {
    console.error("HTTP/2 session error", err);
    if (!res.headersSent) {
      res.status(502).json({ status: false, message: "Login session setup failed." });
    }
  });

  try {
    const formBody = new URLSearchParams();
    Object.entries(req.body || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          formBody.append(key, item ?? "");
        });
      } else {
        formBody.append(key, value ?? "");
      }
    });

    const serializedBody = formBody.toString();
    console.log("Proxying login payload:", serializedBody);

    const requestHeaders = {
      ":method": "POST",
      ":scheme": "https",
      ":authority": API_AUTHORITY,
      ":path": "/api/user/login",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      accept: "application/json, text/javascript, */*; q=0.01",
      "x-requested-with": "XMLHttpRequest",
      pragma: "no-cache",
      "cache-control": "no-cache",
    };

    if (serializedBody.length > 0) {
      requestHeaders["content-length"] = Buffer.byteLength(serializedBody).toString();
    }

    const forwardableHeaders = [
      "accept",
      "accept-language",
      "origin",
      "referer",
      "sec-ch-ua",
      "sec-ch-ua-mobile",
      "sec-ch-ua-platform",
      "sec-fetch-dest",
      "sec-fetch-mode",
      "sec-fetch-site",
      "user-agent",
      "priority",
    ];

    forwardableHeaders.forEach((name) => {
      const value = req.headers[name];
      if (value) {
        requestHeaders[name] = value;
      }
    });

    const cookieHeader = buildCookieHeader(req.headers.cookie);
    if (cookieHeader) {
      requestHeaders.cookie = cookieHeader;
    }

    const h2req = client.request(requestHeaders);

    h2req.setEncoding("utf8");
    h2req.on("response", (headers) => {
      responseHeaders = headers;
    });

    h2req.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    h2req.on("end", () => {
      const status = Number(responseHeaders[":status"]) || 502;
      const body = Buffer.concat(chunks).toString("utf8");
      storeCookiesFromSetCookie(responseHeaders["set-cookie"]);
      Object.entries(responseHeaders).forEach(([key, value]) => {
        if (!key.startsWith(":")) {
          res.setHeader(key, value);
        }
      });
      res.status(status).send(body);
      client.close();
    });

    h2req.on("error", (err) => {
      console.error("HTTP/2 login proxy error", err);
      if (!res.headersSent) {
        res.status(502).json({ status: false, message: "Upstream login request failed." });
      }
      client.destroy();
    });

    h2req.setTimeout(15000, () => {
      console.warn("HTTP/2 login request timed out");
      h2req.close();
      if (!res.headersSent) {
        res.status(504).json({ status: false, message: "Login request timed out." });
      }
      client.destroy();
    });

    h2req.end(serializedBody);
  } catch (err) {
    console.error("Unexpected error proxying login", err);
    if (!res.headersSent) {
      res.status(500).json({ status: false, message: "Login proxy error." });
    }
    client.destroy();
  }
});

app.use(
  "/api",
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    logLevel: "debug",
    pathRewrite: (path) => `/api${path}`,
    on: {
      proxyReq: handleProxyReq,
      proxyRes: handleProxyRes,
    },
  })
);

app.use(
  "/devices",
  createProxyMiddleware(buildStandardProxyConfig())
);



app.use(express.static("."));

app.listen(8080, () => console.log("Local proxy running on http://localhost:8080"));
