import { MongoClient } from "mongodb";

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
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return response(204, {});
  }

  if (event.httpMethod !== "POST") {
    return response(405, {
      error: "Method not allowed"
    });
  }

  try {
    const adminSecret = process.env.TACTIC_ADMIN_SECRET;

    if (!adminSecret) {
      return response(500, {
        error: "TACTIC_ADMIN_SECRET is missing"
      });
    }

    const authHeader = event.headers.authorization || "";

    if (authHeader !== `Bearer ${adminSecret}`) {
      return response(401, {
        error: "Unauthorized"
      });
    }

    const body = JSON.parse(event.body || "{}");

    const { deviceId, userId } = body;

    if (!deviceId || !userId) {
      return response(400, {
        error: "deviceId and userId are required"
      });
    }

    const db = await getDB();

    const users = db.collection("users");
    const devices = db.collection("devices");

    const user = await users.findOne({
      userId
    });

    if (!user) {
      return response(404, {
        error: "User not found"
      });
    }

    const device = await devices.findOne({
      deviceId
    });

    if (!device) {
      return response(404, {
        error: "Device not found"
      });
    }

    await devices.updateOne(
      { deviceId },
      {
        $set: {
          userId,
          updatedAt: new Date()
        }
      }
    );

    return response(200, {
      success: true,
      message: "Device successfully bound to user",
      deviceId,
      userId
    });

  } catch (error) {
    console.error("Bind device error:", error);

    return response(500, {
      error: "Internal server error"
    });
  }
}