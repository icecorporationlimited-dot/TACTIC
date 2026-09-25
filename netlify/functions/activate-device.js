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

function hashToken(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

export default async function handler(req) {

  /* =====================================================
     CORS
  ===================================================== */

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

    /* =====================================================
       AUTH
    ===================================================== */

    const authHeader =
      req.headers.get("authorization");

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return json({
        success: false,
        message: "LOGIN_REQUIRED"
      }, 401);
    }

    const sessionToken =
      authHeader.substring(7).trim();

    if (!sessionToken) {
      return json({
        success: false,
        message: "LOGIN_REQUIRED"
      }, 401);
    }


    /* =====================================================
       DATABASE
    ===================================================== */

    const db = await getDB();

    const sessionHash =
      hashToken(sessionToken);

    const session =
      await db
        .collection("authSessions")
        .findOne({
          tokenHash: sessionHash
        });

    if (!session) {
      return json({
        success: false,
        message: "INVALID_SESSION"
      }, 401);
    }


    /* =====================================================
       SESSION EXPIRY
    ===================================================== */

    if (
      session.expiresAt &&
      new Date(session.expiresAt) <= new Date()
    ) {

      await db
        .collection("authSessions")
        .deleteOne({
          tokenHash: sessionHash
        });

      return json({
        success: false,
        message: "SESSION_EXPIRED"
      }, 401);
    }

    const userId = session.userId;


    /* =====================================================
       REQUEST BODY
    ===================================================== */

    let body = {};

    try {
      body = await req.json();
    } catch {
      return json({
        success: false,
        message: "INVALID_JSON"
      }, 400);
    }

    const activationCode =
      String(body.activationCode || "")
        .trim()
        .toUpperCase();

    if (!activationCode) {
      return json({
        success: false,
        message: "ACTIVATION_CODE_REQUIRED"
      }, 400);
    }


    /* =====================================================
       FIND DEVICE
    ===================================================== */

    const devices =
      db.collection("devices");

    const device =
      await devices.findOne({
        activationCode
      });

    if (!device) {
      return json({
        success: false,
        message: "INVALID_ACTIVATION_CODE"
      }, 404);
    }


    /* =====================================================
       ALREADY ACTIVATED
    ===================================================== */

    if (device.userId) {

      if (String(device.userId) === String(userId)) {

        return json({
          success: true,
          message: "DEVICE_ALREADY_LINKED",
          device: {
            deviceId: device.deviceId,
            status: device.status || "active"
          }
        }, 200);
      }

      return json({
        success: false,
        message: "DEVICE_ALREADY_ACTIVATED"
      }, 409);
    }


    /* =====================================================
       ACTIVATE DEVICE
    ===================================================== */

    const result =
      await devices.updateOne(
        {
          _id: device._id,
          userId: null,
          activationCode
        },
        {
          $set: {
            userId,
            status: "active",
            activatedAt: new Date(),
            updatedAt: new Date()
          },
          $unset: {
            activationCode: ""
          }
        }
      );

    if (result.modifiedCount !== 1) {
      return json({
        success: false,
        message: "DEVICE_ACTIVATION_CONFLICT"
      }, 409);
    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    return json({
      success: true,
      message: "DEVICE_ACTIVATED",
      device: {
        deviceId: device.deviceId,
        status: "active"
      }
    }, 200);

  } catch (error) {

    console.error(
      "ACTIVATE DEVICE ERROR:",
      error
    );

    return json({
      success: false,
      message: "SERVER_ERROR"
    }, 500);
  }
}