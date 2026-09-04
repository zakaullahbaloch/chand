const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const startpairing = require("./pair");

const app = express();

app.use(express.json());

app.use(cors({
  origin: [
    "https://chand-xmd.vercel.app",
    "http://localhost:3000"
  ]
}));

const pairingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: "Too many requests. Please try again later."
  }
});

const pairingFolder = path.join(
  __dirname,
  "kingbadboitimewisher",
  "pairing"
);

const activeRequests = new Set();

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Chand XMD API is running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online"
  });
});

app.post("/api/pair", pairingLimiter, async (req, res) => {
  try {
    let { number } = req.body;

    if (!number) {
      return res.status(400).json({
        success: false,
        error: "WhatsApp number is required"
      });
    }

    number = String(number).replace(/\D/g, "");

    if (!/^\d{7,15}$/.test(number)) {
      return res.status(400).json({
        success: false,
        error: "Invalid WhatsApp number"
      });
    }

    if (number.startsWith("0")) {
      return res.status(400).json({
        success: false,
        error: "Number country code ke sath likhein"
      });
    }

    if (activeRequests.has(number)) {
      return res.status(409).json({
        success: false,
        error: "Is number ke liye pairing already process mein hai"
      });
    }

    activeRequests.add(number);

    const pairingFile = path.join(pairingFolder, "pairing.json");

    if (!fs.existsSync(pairingFolder)) {
      fs.mkdirSync(pairingFolder, { recursive: true });
    }

    if (fs.existsSync(pairingFile)) {
      try {
        fs.unlinkSync(pairingFile);
      } catch (error) {
        console.log("Old pairing file delete error:", error.message);
      }
    }

    const whatsappNumber = number + "@s.whatsapp.net";

    await startpairing(whatsappNumber);

    let pairingCode = null;

    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (fs.existsSync(pairingFile)) {
        try {
          const data = JSON.parse(
            fs.readFileSync(pairingFile, "utf8")
          );

          if (data.code) {
            pairingCode = data.code;
            break;
          }
        } catch (error) {
          console.log("Pairing file read error:", error.message);
        }
      }
    }

    activeRequests.delete(number);

    if (!pairingCode) {
      return res.status(500).json({
        success: false,
        error: "Pairing code generate nahi hua"
      });
    }

    return res.json({
      success: true,
      number,
      code: pairingCode,
      expiresIn: 120,
      instructions: [
        "WhatsApp open karein",
        "Settings mein jayein",
        "Linked Devices open karein",
        "Link a Device select karein",
        "Pairing code enter karein"
      ]
    });

  } catch (error) {
    console.error("Pair API error:", error);
    return res.status(500).json({
      success: false,
      error: "Pairing service temporarily unavailable"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web API running on port ${PORT}`);
});

