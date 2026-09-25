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

/* =====================================================
   NORMALIZE HARDWARE ID
===================================================== */

function normalizeHardwareId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[:-]/g, "");
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

    /* =================================================
       ADMIN AUTH
    ================================================= */

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

    if (
      !authHeader ||
      authHeader !== `Bearer ${adminSecret}`
    ) {
      return json({
        success: false,
        message: "UNAUTHORIZED"
      }, 401);
    }

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

    const deviceId =
      String(body.deviceId || "")
        .trim()
        .toUpperCase();

    const hardwareId =
      normalizeHardwareId(body.hardwareId);

    if (!deviceId) {
      return json({
        success: false,
        message: "DEVICE_ID_REQUIRED"
      }, 400);
    }

    if (!hardwareId) {
      return json({
        success: false,
        message: "HARDWARE_ID_REQUIRED"
      }, 400);
    }

    /* =================================================
       BASIC HARDWARE ID VALIDATION
    ================================================= */

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
        deviceId
      });

    if (!device) {
      return json({
        success: false,
        message: "DEVICE_NOT_FOUND"
      }, 404);
    }

    /* =================================================
       CHECK EXISTING HARDWARE BINDING
    ================================================= */

    const existing =
      await devices.findOne({
        hardwareId
      });

    if (
      existing &&
      String(existing._id) !== String(device._id)
    ) {
      return json({
        success: false,
        message: "HARDWARE_ALREADY_BOUND"
      }, 409);
    }

    /* =================================================
       BIND HARDWARE
    ================================================= */

    await devices.updateOne(
      {
        _id: device._id
      },
      {
        $set: {
          hardwareId,
          bootstrapPending: true,
          updatedAt: new Date()
        }
      }
    );

    /* =================================================
       SUCCESS
    ================================================= */

    return json({
      success: true,
      message: "HARDWARE_BOUND",
      device: {
        deviceId,
        hardwareId,
        bootstrapPending: true
      }
    }, 200);

  } catch (error) {

    console.error(
      "BIND HARDWARE ERROR:",
      error
    );

    return json({
      success: false,
      message: "SERVER_ERROR"
    }, 500);
  }
}