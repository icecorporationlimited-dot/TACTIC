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

function hashToken(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
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
       USER SESSION
    ================================================ */

    const authHeader =
      req.headers.authorization ||
      req.headers.Authorization;

    if (!authHeader?.startsWith("Bearer ")) {

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: "LOGIN_REQUIRED"
        })
      };

    }

    const sessionToken =
      authHeader.substring(7).trim();

    if (!sessionToken) {

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: "LOGIN_REQUIRED"
        })
      };

    }

    const db = await getDB();

    const sessionHash =
      hashToken(sessionToken);

    const session =
      await db.collection("authSessions").findOne({
        tokenHash: sessionHash
      });

    if (!session) {

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: "INVALID_SESSION"
        })
      };

    }

    if (
      session.expiresAt &&
      new Date(session.expiresAt) <= new Date()
    ) {

      await db.collection("authSessions").deleteOne({
        tokenHash: sessionHash
      });

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: "SESSION_EXPIRED"
        })
      };

    }

    const userId = session.userId;


    /* ================================================
       BODY
    ================================================ */

    let body = {};

    try {
      body = JSON.parse(req.body || "{}");
    } catch {

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: "INVALID_JSON"
        })
      };

    }

    const activationCode =
      String(body.activationCode || "")
        .trim()
        .toUpperCase();

    if (!activationCode) {

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: "ACTIVATION_CODE_REQUIRED"
        })
      };

    }


    /* ================================================
       FIND DEVICE
    ================================================ */

    const device =
      await db.collection("devices").findOne({
        activationCode
      });

    if (!device) {

      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: "INVALID_ACTIVATION_CODE"
        })
      };

    }


    /* ================================================
       ALREADY ACTIVATED
    ================================================ */

    if (device.userId) {

      if (device.userId === userId) {

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: "DEVICE_ALREADY_LINKED",
            device: {
              deviceId: device.deviceId,
              status: device.status || "active"
            }
          })
        };

      }

      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          message: "DEVICE_ALREADY_ACTIVATED"
        })
      };

    }


    /* ================================================
       ACTIVATE DEVICE
    ================================================ */

    const result =
      await db.collection("devices").updateOne(
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

      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          message: "DEVICE_ACTIVATION_CONFLICT"
        })
      };

    }


    /* ================================================
       SUCCESS
    ================================================ */

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "DEVICE_ACTIVATED",
        device: {
          deviceId: device.deviceId,
          status: "active"
        }
      })
    };

  } catch (error) {

    console.error("ACTIVATE DEVICE ERROR:", error);

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