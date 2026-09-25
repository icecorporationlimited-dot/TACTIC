import { MongoClient } from "mongodb";
import crypto from "crypto";

let mongoClient;

async function getDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
  }

  return mongoClient.db("tactic");
}

function generateDeviceToken() {
  return (
    "TACTIC-" +
    crypto.randomBytes(32).toString("hex")
  );
}

function hashToken(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function generateActivationCode() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function part(length) {

    let output = "";

    for (let i = 0; i < length; i++) {

      output +=
        chars[
          crypto.randomInt(0, chars.length)
        ];

    }

    return output;
  }

  return `TACTIC-${part(4)}-${part(4)}`;
}

export default async (req) => {

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (req.method === "OPTIONS") {
    return {
      statusCode: 204,
      headers
    };
  }

  if (req.method !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        message: "METHOD_NOT_ALLOWED"
      })
    };
  }

  try {

    /* ================================================
       ADMIN AUTH
    ================================================ */

    const authHeader =
      req.headers.authorization ||
      req.headers.Authorization;

    const expected =
      `Bearer ${process.env.TACTIC_ADMIN_SECRET}`;

    if (
      !authHeader ||
      authHeader !== expected
    ) {

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: "UNAUTHORIZED"
        })
      };

    }


    /* ================================================
       DATABASE
    ================================================ */

    const db = await getDB();

    const devices =
      db.collection("devices");


    /* ================================================
       NEXT DEVICE ID
    ================================================ */

    const lastDevice =
      await devices
        .find({})
        .sort({ deviceId: -1 })
        .limit(1)
        .toArray();

    let nextNumber = 1;

    if (lastDevice.length) {

      const match =
        String(lastDevice[0].deviceId)
          .match(/TAC-(\d+)/);

      if (match) {
        nextNumber =
          Number(match[1]) + 1;
      }

    }

    const deviceId =
      `TAC-${String(nextNumber).padStart(6, "0")}`;


    /* ================================================
       GENERATE CREDENTIALS
    ================================================ */

    const deviceToken =
      generateDeviceToken();

    const tokenHash =
      hashToken(deviceToken);

    let activationCode;

    while (true) {

      activationCode =
        generateActivationCode();

      const existing =
        await devices.findOne({
          activationCode
        });

      if (!existing) break;

    }


    /* ================================================
       CREATE DEVICE
    ================================================ */

    await devices.insertOne({

      deviceId,

      tokenHash,

      activationCode,

      userId: null,

      status: "active",

      createdAt: new Date(),

      updatedAt: new Date()

    });


    /* ================================================
       RETURN ONCE
    ================================================ */

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({

        success: true,

        message: "DEVICE_PROVISIONED",

        device: {
          deviceId,

          activationCode,

          /*
            IMPORTANT:
            deviceToken is shown only during
            provisioning and should be stored
            securely for ESP32 firmware setup.
          */

          deviceToken

        }

      })
    };

  } catch (error) {

    console.error(
      "PROVISION DEVICE ERROR:",
      error
    );

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: "SERVER_ERROR"
      })
    };

  }

};