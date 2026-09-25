import { MongoClient } from "mongodb";

const DOMAINS = [
  "instagram.com",
  "snapchat.com",
  "youtube.com"
];

const FOCUS_DURATION = 45 * 60 * 1000;

let mongoClient;

/* =====================================================
   MONGODB CONNECTION
===================================================== */

async function getDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
  }

  return mongoClient.db("tactic");
}

/* =====================================================
   RESPONSE
===================================================== */

function response(data, status = 200, extraHeaders = {}) {
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
          "GET, POST, OPTIONS",
        ...extraHeaders
      }
    }
  );
}

/* =====================================================
   MAIN API
===================================================== */

export default async function handler(req) {

  /* OPTIONS */

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",
        "Access-Control-Allow-Methods":
          "GET, POST, OPTIONS"
      }
    });
  }

  /* ===================================================
     AUTH
  =================================================== */

  const auth = req.headers.get("Authorization");
  const expectedToken = process.env.TACTIC_DEVICE_TOKEN;

  if (
    !auth ||
    !expectedToken ||
    auth !== `Bearer ${expectedToken}`
  ) {
    return response(
      {
        success: false,
        error: "UNAUTHORIZED"
      },
      401
    );
  }

  /* ===================================================
     DATABASE
  =================================================== */

  let db;

  try {
    db = await getDB();
  } catch (error) {

    console.error("MongoDB connection error:", error);

    return response(
      {
        success: false,
        error: "DATABASE_CONNECTION_FAILED"
      },
      500
    );
  }

  const devices = db.collection("devices");
  const sessions = db.collection("sessions");
  const policies = db.collection("policies");

  /* ===================================================
     DEVICE
  =================================================== */

  const deviceId = "TAC-000001";

  let device = await devices.findOne({
    deviceId
  });

  if (!device) {

    device = {
      deviceId,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await devices.insertOne(device);
  }

  /* ===================================================
     GET STATUS
  =================================================== */

  if (req.method === "GET") {

    const activeSession = await sessions.findOne({
      deviceId,
      status: "active"
    });

    const policy = await policies.findOne({
      deviceId
    });

    return response({
      success: true,

      device: {
        deviceId,
        status: device.status
      },

      session: activeSession
        ? {
            active: true,
            startedAt: activeSession.startedAt,
            expiresAt: activeSession.expiresAt
          }
        : {
            active: false,
            startedAt: null,
            expiresAt: null
          },

      policy: policy || {
        instagram: true,
        snapchat: true,
        youtube: true
      }
    });
  }

  /* ===================================================
     POST
  =================================================== */

  if (req.method === "POST") {

    let body;

    try {
      body = await req.json();
    } catch {

      return response(
        {
          success: false,
          error: "INVALID_JSON"
        },
        400
      );
    }

    /* =================================================
       START SESSION
    ================================================= */

    if (body.action === "start") {

      const existingSession = await sessions.findOne({
        deviceId,
        status: "active"
      });

      if (existingSession) {

        return response(
          {
            success: false,
            error: "SESSION_ALREADY_ACTIVE",
            expiresAt: existingSession.expiresAt
          },
          409
        );
      }

      /* BLOCK DNS */

      const result = await blockAllDomains();

      if (!result.success) {

        return response(
          {
            success: false,
            error: "DNS_BLOCK_FAILED",
            details: result
          },
          500
        );
      }

      const startedAt = new Date();
      const expiresAt = new Date(
        startedAt.getTime() + FOCUS_DURATION
      );

      /* SAVE SESSION */

      await sessions.insertOne({
        deviceId,
        status: "active",
        startedAt,
        expiresAt,
        createdAt: new Date()
      });

      /* UPDATE DEVICE */

      await devices.updateOne(
        { deviceId },
        {
          $set: {
            status: "focus",
            updatedAt: new Date()
          }
        }
      );

      return response({
        success: true,
        message: "TACTIC SESSION STARTED",
        deviceId,
        blockedDomains: DOMAINS,
        startedAt,
        expiresAt
      });
    }

    /* =================================================
       COMPLETE SESSION
    ================================================= */

    if (body.action === "complete") {

      const activeSession = await sessions.findOne({
        deviceId,
        status: "active"
      });

      if (!activeSession) {

        return response(
          {
            success: false,
            error: "NO_ACTIVE_SESSION"
          },
          400
        );
      }

      const now = Date.now();
      const expiry = new Date(
        activeSession.expiresAt
      ).getTime();

      /* TOO EARLY */

      if (now < expiry) {

        return response(
          {
            success: false,
            error: "SESSION_NOT_FINISHED",
            remaining: expiry - now
          },
          403
        );
      }

      /* RESTORE DNS */

      const result = await restoreAllDomains();

      if (!result.success) {

        /*
         IMPORTANT:
         Session remains ACTIVE if DNS restore
         fails. This prevents false unlock.
        */

        return response(
          {
            success: false,
            error: "DNS_RESTORE_FAILED",
            details: result
          },
          500
        );
      }

      /* MARK SESSION COMPLETE */

      await sessions.updateOne(
        {
          _id: activeSession._id
        },
        {
          $set: {
            status: "completed",
            completedAt: new Date()
          }
        }
      );

      /* DEVICE READY */

      await devices.updateOne(
        { deviceId },
        {
          $set: {
            status: "active",
            updatedAt: new Date()
          }
        }
      );

      return response({
        success: true,
        message: "TACTIC SESSION COMPLETED",
        restoredDomains: DOMAINS
      });
    }

    return response(
      {
        success: false,
        error: "UNKNOWN_ACTION"
      },
      400
    );
  }

  return response(
    {
      success: false,
      error: "METHOD_NOT_ALLOWED"
    },
    405
  );
}


/* =====================================================
   NEXTDNS — BLOCK
===================================================== */

async function blockAllDomains() {

  const profile =
    process.env.NEXTDNS_PROFILE_ID;

  const apiKey =
    process.env.NEXTDNS_API_KEY;

  if (!profile || !apiKey) {

    return {
      success: false,
      error: "NEXTDNS_CONFIG_MISSING"
    };
  }

  const results = [];

  for (const domain of DOMAINS) {

    try {

      const url =
        `https://api.nextdns.io/profiles/${profile}/denylist`;

      const res = await fetch(url, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey
        },

        body: JSON.stringify({
          id: domain,
          active: true
        })
      });

      results.push({
        domain,
        status: res.status,
        success: res.ok
      });

    } catch (error) {

      results.push({
        domain,
        success: false,
        error: error.message
      });
    }
  }

  return {
    success: results.every(
      item => item.success
    ),
    results
  };
}


/* =====================================================
   NEXTDNS — RESTORE
===================================================== */

async function restoreAllDomains() {

  const profile =
    process.env.NEXTDNS_PROFILE_ID;

  const apiKey =
    process.env.NEXTDNS_API_KEY;

  if (!profile || !apiKey) {

    return {
      success: false,
      error: "NEXTDNS_CONFIG_MISSING"
    };
  }

  const results = [];

  for (const domain of DOMAINS) {

    try {

      const url =
        `https://api.nextdns.io/profiles/${profile}/denylist/${domain}`;

      const res = await fetch(url, {

        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey
        },

        body: JSON.stringify({
          active: false
        })
      });

      results.push({
        domain,
        status: res.status,
        success: res.ok
      });

    } catch (error) {

      results.push({
        domain,
        success: false,
        error: error.message
      });
    }
  }

  return {
    success: results.every(
      item => item.success
    ),
    results
  };
}