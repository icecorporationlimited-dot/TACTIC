import { MongoClient } from "mongodb";
import crypto from "crypto";

let mongoClient;

async function getDB() {
  if (!mongoClient) {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI is missing");
    }

    mongoClient = new MongoClient(uri);
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
          "Content-Type",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS"
      }
    }
  );
}

/* =====================================================
   HARDWARE ID
===================================================== */

function normalizeHardwareId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[:-]/g, "");
}

/* =====================================================
   DEVICE TOKEN
===================================================== */

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

/* =====================================================
   MAIN
===================================================== */

export default async function handler(req) {

  /* ===================================================
     CORS
  =================================================== */

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type",
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

    /* =================================================
       BODY
    ================================================= */

    let body = {};

    try {
      body = await req.json();
    } catch {
      return json({
        success: false,
        message: "INVALID_JSON"
      }, 400);
    }

    const hardwareId =
      normalizeHardwareId(body.hardwareId);

    if (!hardwareId) {
      return json({
        success: false,
        message: "HARDWARE_ID_REQUIRED"
      }, 400);
    }

    if (!/^[0-9A-F]{12}$/.test(hardwareId)) {
      return json({
        success: false,
        message: "INVALID_HARDWARE_ID"
      }, 400);
    }

    /* =================================================
       DATABASE
    ================================================= */

    const db = await getDB();

    const devices =
      db.collection("devices");

    /* =================================================
       FIND DEVICE
    ================================================= */

    const device =
      await devices.findOne({
        hardwareId
      });

    if (!device) {
      return json({
        success: false,
        message: "DEVICE_NOT_REGISTERED"
      }, 404);
    }

    /* =================================================
       REVOKED DEVICE
    ================================================= */

    if (device.status === "revoked") {
      return json({
        success: false,
        message: "DEVICE_REVOKED"
      }, 403);
    }

    /* =================================================
       CUSTOMER ACTIVATION CHECK
    ================================================= */

    if (!device.userId) {
      return json({
        success: false,
        message: "DEVICE_NOT_ACTIVATED"
      }, 403);
    }

    /* =================================================
       BOOTSTRAP CHECK
    ================================================= */

    if (device.bootstrapPending !== true) {
      return json({
        success: false,
        message: "BOOTSTRAP_ALREADY_COMPLETED"
      }, 409);
    }

    /* =================================================
       NEW DEVICE TOKEN
    ================================================= */

    const deviceToken =
      generateDeviceToken();

    const tokenHash =
      hashToken(deviceToken);

    /* =================================================
       ATOMIC BOOTSTRAP
    ================================================= */

    const result =
      await devices.findOneAndUpdate(
        {
          _id: device._id,
          hardwareId,
          bootstrapPending: true,
          userId: {
            $ne: null
          },
          status: {
            $ne: "revoked"
          }
        },
        {
          $set: {
            tokenHash,
            bootstrapPending: false,
            bootstrappedAt: new Date(),
            updatedAt: new Date()
          }
        },
        {
          returnDocument: "after"
        }
      );

    if (!result) {
      return json({
        success: false,
        message: "BOOTSTRAP_CONFLICT"
      }, 409);
    }

    /* =================================================
       SUCCESS
    ================================================= */

    return json({
      success: true,
      message: "DEVICE_BOOTSTRAPPED",

      device: {
        deviceId: device.deviceId,
        status: result.status || "active"
      },

      /*
        IMPORTANT:
        ESP32 stores this in NVS.
        It is never stored in MongoDB as plaintext.
      */

      deviceToken

    }, 200);

  } catch (error) {

    console.error(
      "DEVICE BOOTSTRAP ERROR:",
      error
    );

    return json({
      success: false,
      message: "SERVER_ERROR"
    }, 500);
  }
}