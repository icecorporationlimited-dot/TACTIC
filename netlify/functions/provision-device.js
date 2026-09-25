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

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS"
      }
    }
  );
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
      output += chars[
        crypto.randomInt(0, chars.length)
      ];
    }

    return output;
  }

  return `TACTIC-${part(4)}-${part(4)}`;
}

export default async function handler(req) {

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS"
      }
    });
  }

  if (req.method !== "POST") {
    return json({
      success: false,
      message: "METHOD_NOT_ALLOWED"
    }, 405);
  }

  try {

    /* ================================================
       ADMIN AUTH
    ================================================ */

    const authHeader =
      req.headers.get("authorization");

    const adminSecret =
      process.env.TACTIC_ADMIN_SECRET;

    if (!adminSecret) {

      console.error(
        "TACTIC_ADMIN_SECRET is missing"
      );

      return json({
        success: false,
        message: "SERVER_CONFIGURATION_ERROR"
      }, 500);
    }

    const expected =
      `Bearer ${adminSecret}`;

    if (
      !authHeader ||
      authHeader !== expected
    ) {

      return json({
        success: false,
        message: "UNAUTHORIZED"
      }, 401);
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
       CREDENTIALS
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
       RESPONSE
    ================================================ */

    return json({
      success: true,

      message: "DEVICE_PROVISIONED",

      device: {
        deviceId,
        activationCode,

        // Only needed for ESP32 setup.
        // Never give this to customers.
        deviceToken
      }

    }, 201);

  } catch (error) {

    console.error(
      "PROVISION DEVICE ERROR:",
      error
    );

    return json({
      success: false,
      message: "SERVER_ERROR"
    }, 500);
  }
}
