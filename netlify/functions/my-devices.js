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

function response(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return response(204, {});
  }

  if (event.httpMethod !== "GET") {
    return response(405, {
      error: "Method not allowed"
    });
  }

  try {
    const authHeader = event.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return response(401, {
        error: "Authentication required"
      });
    }

    const sessionToken = authHeader.slice(7).trim();

    if (!sessionToken) {
      return response(401, {
        error: "Invalid session"
      });
    }

    const db = await getDB();

    const authSessions = db.collection("authSessions");
    const devices = db.collection("devices");

    const tokenHash = hashToken(sessionToken);

    const session = await authSessions.findOne({
      tokenHash
    });

    if (!session) {
      return response(401, {
        error: "Invalid session"
      });
    }

    if (new Date(session.expiresAt) <= new Date()) {
      await authSessions.deleteOne({
        _id: session._id
      });

      return response(401, {
        error: "Session expired"
      });
    }

    const userDevices = await devices
      .find(
        {
          userId: session.userId
        },
        {
          projection: {
            _id: 0,
            deviceId: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1
          }
        }
      )
      .sort({
        createdAt: -1
      })
      .toArray();

    return response(200, {
      success: true,
      userId: session.userId,
      devices: userDevices
    });

  } catch (error) {
    console.error("My devices error:", error);

    return response(500, {
      error: "Internal server error"
    });
  }
}