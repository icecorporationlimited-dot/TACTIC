import { MongoClient } from "mongodb";
import crypto from "crypto";

const DOMAINS = [
  "instagram.com",
  "snapchat.com",
  "youtube.com"
];

const FOCUS_DURATION = 45 * 60 * 1000;

let mongoClient;

/* =====================================================
   MONGODB
===================================================== */

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

/* =====================================================
   RESPONSE
===================================================== */

function response(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

/* =====================================================
   TOKEN HASH
===================================================== */

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

/* =====================================================
   NEXTDNS
===================================================== */

async function nextDNSRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "X-Api-Key": process.env.NEXTDNS_API_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `NextDNS error ${response.status}: ${text}`
    );
  }

  return data;
}

/* =====================================================
   BLOCK DOMAINS
===================================================== */

async function blockAllDomains(policy) {
  const profileId = process.env.NEXTDNS_PROFILE_ID;

  if (!profileId) {
    throw new Error("NEXTDNS_PROFILE_ID is missing");
  }

  for (const domain of DOMAINS) {
    if (!policy[domain]) continue;

    const url =
      `https://api.nextdns.io/profiles/${profileId}/denylist`;

    await nextDNSRequest(url, {
      method: "POST",
      body: JSON.stringify({
        domain,
        active: true
      })
    });
  }
}

/* =====================================================
   RESTORE DOMAINS
===================================================== */

async function restoreAllDomains(policy) {
  const profileId = process.env.NEXTDNS_PROFILE_ID;

  if (!profileId) {
    throw new Error("NEXTDNS_PROFILE_ID is missing");
  }

  for (const domain of DOMAINS) {
    if (!policy[domain]) continue;

    const url =
      `https://api.nextdns.io/profiles/${profileId}/denylist/${domain}`;

    await nextDNSRequest(url, {
      method: "PATCH",
      body: JSON.stringify({
        active: false
      })
    });
  }
}

/* =====================================================
   USER SESSION AUTH
===================================================== */

async function authenticateUser(db, token) {
  const tokenHash = hashToken(token);

  const authSession = await db.collection("authSessions").findOne({
    tokenHash
  });

  if (!authSession) {
    return null;
  }

  if (new Date(authSession.expiresAt) <= new Date()) {
    await db.collection("authSessions").deleteOne({
      _id: authSession._id
    });

    return null;
  }

  return {
    userId: authSession.userId,
    type: "user"
  };
}

/* =====================================================
   DEVICE TOKEN AUTH
===================================================== */

async function authenticateDevice(db, token) {
  const tokenHash = hashToken(token);

  let device = await db.collection("devices").findOne({
    tokenHash
  });

  /* ---------------------------------------------------
     LEGACY MIGRATION
  --------------------------------------------------- */

  if (!device) {
    const legacyDevice = await db.collection("devices").findOne({
      token
    });

    if (legacyDevice) {
      const newHash = hashToken(token);

      await db.collection("devices").updateOne(
        {
          _id: legacyDevice._id
        },
        {
          $set: {
            tokenHash: newHash,
            updatedAt: new Date()
          },
          $unset: {
            token: ""
          }
        }
      );

      device = {
        ...legacyDevice,
        tokenHash: newHash
      };
    }
  }

  if (!device) {
    return null;
  }

  if (device.status === "revoked") {
    return null;
  }

  return {
    deviceId: device.deviceId,
    userId: device.userId || null,
    type: "device"
  };
}

/* =====================================================
   FIND USER DEVICE
===================================================== */

async function getUserDevice(db, userId, deviceId) {
  if (!deviceId) {
    return null;
  }

  return await db.collection("devices").findOne({
    deviceId,
    userId
  });
}

/* =====================================================
   MAIN HANDLER
===================================================== */

export async function handler(event) {

  /* ---------------------------------------------------
     OPTIONS
  --------------------------------------------------- */

  if (event.httpMethod === "OPTIONS") {
    return response(204, {});
  }

  try {

    const db = await getDB();

    const devices = db.collection("devices");
    const sessions = db.collection("sessions");
    const policies = db.collection("policies");

    /* =================================================
       AUTHORIZATION
    ================================================= */

    const authHeader =
      event.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return response(401, {
        error: "Authorization required"
      });
    }

    const token =
      authHeader.slice(7).trim();

    if (!token) {
      return response(401, {
        error: "Invalid token"
      });
    }

    /* =================================================
       TRY USER SESSION FIRST
    ================================================= */

    let auth = await authenticateUser(
      db,
      token
    );

    /* =================================================
       IF NOT USER → TRY DEVICE TOKEN
    ================================================= */

    if (!auth) {
      auth = await authenticateDevice(
        db,
        token
      );
    }

    if (!auth) {
      return response(401, {
        error: "Invalid or expired authentication"
      });
    }

    /* =================================================
       GET REQUEST
    ================================================= */

    if (event.httpMethod === "GET") {

      /* -----------------------------------------------
         DEVICE AUTH
      ----------------------------------------------- */

      if (auth.type === "device") {

        const device = await devices.findOne({
          deviceId: auth.deviceId
        });

        if (!device) {
          return response(404, {
            error: "Device not found"
          });
        }

        let policy = await policies.findOne({
          deviceId: auth.deviceId
        });

        if (!policy) {

          policy = {
            deviceId: auth.deviceId,
            instagram: true,
            snapchat: true,
            youtube: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await policies.insertOne(policy);
        }

        const activeSession =
          await sessions.findOne({
            deviceId: auth.deviceId,
            status: "active"
          });

        return response(200, {
          success: true,
          authType: "device",
          deviceId: auth.deviceId,
          status: device.status,
          session: activeSession
            ? {
                startedAt: activeSession.startedAt,
                expiresAt: activeSession.expiresAt,
                expired:
                  new Date(activeSession.expiresAt) <=
                  new Date()
              }
            : null,
          policy: {
            instagram: policy.instagram,
            snapchat: policy.snapchat,
            youtube: policy.youtube
          }
        });
      }

      /* -----------------------------------------------
         USER AUTH
      ----------------------------------------------- */

      if (auth.type === "user") {

        const params = event.queryStringParameters || {};

        const deviceId = params.deviceId;

        if (!deviceId) {
          return response(400, {
            error: "deviceId is required"
          });
        }

        const device =
          await getUserDevice(
            db,
            auth.userId,
            deviceId
          );

        if (!device) {
          return response(403, {
            error: "You do not have access to this device"
          });
        }

        let policy = await policies.findOne({
          deviceId
        });

        if (!policy) {

          policy = {
            deviceId,
            instagram: true,
            snapchat: true,
            youtube: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await policies.insertOne(policy);
        }

        const activeSession =
          await sessions.findOne({
            deviceId,
            status: "active"
          });

        return response(200, {
          success: true,
          authType: "user",
          userId: auth.userId,
          deviceId,
          status: device.status,
          session: activeSession
            ? {
                startedAt: activeSession.startedAt,
                expiresAt: activeSession.expiresAt,
                expired:
                  new Date(activeSession.expiresAt) <=
                  new Date()
              }
            : null,
          policy: {
            instagram: policy.instagram,
            snapchat: policy.snapchat,
            youtube: policy.youtube
          }
        });
      }
    }

    /* =================================================
       POST
    ================================================= */

    if (event.httpMethod === "POST") {

      const body =
        JSON.parse(event.body || "{}");

      const action = body.action;

      /* ===============================================
         DEVICE ID
      =============================================== */

      let deviceId = null;

      /* -----------------------------------------------
         ESP32
      ----------------------------------------------- */

      if (auth.type === "device") {
        deviceId = auth.deviceId;
      }

      /* -----------------------------------------------
         WEB USER
      ----------------------------------------------- */

      if (auth.type === "user") {

        if (!body.deviceId) {
          return response(400, {
            error: "deviceId is required"
          });
        }

        const device =
          await getUserDevice(
            db,
            auth.userId,
            body.deviceId
          );

        if (!device) {
          return response(403, {
            error: "You do not have access to this device"
          });
        }

        deviceId = body.deviceId;
      }

      /* ===============================================
         DEVICE CHECK
      =============================================== */

      const device = await devices.findOne({
        deviceId
      });

      if (!device) {
        return response(404, {
          error: "Device not found"
        });
      }

      /* ===============================================
         POLICY
      =============================================== */

      let policy = await policies.findOne({
        deviceId
      });

      if (!policy) {

        policy = {
          deviceId,
          instagram: true,
          snapchat: true,
          youtube: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await policies.insertOne(policy);
      }

      /* =================================================
         START FOCUS
      ================================================= */

      if (action === "start") {

        const existingSession =
          await sessions.findOne({
            deviceId,
            status: "active"
          });

        if (existingSession) {

          const expired =
            new Date(existingSession.expiresAt) <=
            new Date();

          if (expired) {

            await sessions.updateOne(
              {
                _id: existingSession._id
              },
              {
                $set: {
                  status: "expired",
                  updatedAt: new Date()
                }
              }
            );

          } else {

            return response(409, {
              error: "Focus session already active",
              expiresAt:
                existingSession.expiresAt
            });
          }
        }

        /* -----------------------------------------------
           BLOCK
        ----------------------------------------------- */

        await blockAllDomains(policy);

        const startedAt = new Date();

        const expiresAt = new Date(
          startedAt.getTime() +
          FOCUS_DURATION
        );

        const newSession = {
          deviceId,
          startedAt,
          expiresAt,
          status: "active",
          createdAt: new Date()
        };

        await sessions.insertOne(
          newSession
        );

        await devices.updateOne(
          {
            deviceId
          },
          {
            $set: {
              status: "focus",
              updatedAt: new Date()
            }
          }
        );

        return response(200, {
          success: true,
          action: "start",
          deviceId,
          startedAt,
          expiresAt,
          duration: FOCUS_DURATION
        });
      }

      /* =================================================
         COMPLETE
      ================================================= */

      if (action === "complete") {

        const activeSession =
          await sessions.findOne({
            deviceId,
            status: "active"
          });

        if (!activeSession) {
          return response(404, {
            error: "No active focus session"
          });
        }

        const now = new Date();

        if (
          now < new Date(activeSession.expiresAt)
        ) {

          return response(403, {
            error: "Focus session has not finished yet",
            expiresAt:
              activeSession.expiresAt
          });
        }

        /* -----------------------------------------------
           RESTORE
        ----------------------------------------------- */

        await restoreAllDomains(policy);

        await sessions.updateOne(
          {
            _id: activeSession._id
          },
          {
            $set: {
              status: "completed",
              completedAt: now,
              updatedAt: now
            }
          }
        );

        await devices.updateOne(
          {
            deviceId
          },
          {
            $set: {
              status: "active",
              updatedAt: now
            }
          }
        );

        return response(200, {
          success: true,
          action: "complete",
          deviceId,
          completedAt: now
        });
      }

      return response(400, {
        error: "Unknown action"
      });
    }

    return response(405, {
      error: "Method not allowed"
    });

  } catch (error) {

    console.error(
      "TACTIC error:",
      error
    );

    return response(500, {
      error: "Internal server error"
    });
  }
}