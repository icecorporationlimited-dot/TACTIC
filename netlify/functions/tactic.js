import { MongoClient } from "mongodb";
import crypto from "crypto";

/* =====================================================
   CONFIG
===================================================== */

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

function response(data, status = 200) {
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
          "GET, POST, OPTIONS"
      }
    }
  );
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
   GENERATE DEVICE TOKEN
===================================================== */

function generateDeviceToken() {

  const random =
    crypto.randomBytes(32).toString("hex");

  return `TACTIC-${random}`;
}

/* =====================================================
   GENERATE DEVICE ID
===================================================== */

async function generateDeviceId(devices) {

  const lastDevice =
    await devices
      .find({})
      .sort({ deviceId: -1 })
      .limit(1)
      .next();

  let number = 1;

  if (lastDevice?.deviceId) {

    const match =
      lastDevice.deviceId.match(
        /TAC-(\d+)/
      );

    if (match) {
      number =
        parseInt(match[1], 10) + 1;
    }
  }

  return `TAC-${String(number).padStart(6, "0")}`;
}

/* =====================================================
   MAIN HANDLER
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
          "GET, POST, OPTIONS"
      }
    });
  }

  /* ===================================================
     DATABASE
  =================================================== */

  let db;

  try {

    db = await getDB();

  } catch (error) {

    console.error(
      "MongoDB connection error:",
      error
    );

    return response(
      {
        success: false,
        error: "DATABASE_CONNECTION_FAILED"
      },
      500
    );
  }

  /* ===================================================
     COLLECTIONS
  =================================================== */

  const devices =
    db.collection("devices");

  const sessions =
    db.collection("sessions");

  const policies =
    db.collection("policies");

  /* ===================================================
     DEVICE AUTH
  =================================================== */

  const auth =
    req.headers.get("Authorization");

  if (
    !auth ||
    !auth.startsWith("Bearer ")
  ) {

    return response(
      {
        success: false,
        error: "UNAUTHORIZED"
      },
      401
    );
  }

  const deviceToken =
    auth.slice(7).trim();

  if (!deviceToken) {

    return response(
      {
        success: false,
        error: "UNAUTHORIZED"
      },
      401
    );
  }

  /* ===================================================
     FIND DEVICE
  =================================================== */

  const tokenHash =
    hashToken(deviceToken);

  let device =
    await devices.findOne({
      tokenHash
    });

  /* ===================================================
     LEGACY TOKEN MIGRATION
     
     Existing device:
     TAC-000001
     token: TACTIC-DEV-001-SECRET

     If found, automatically migrate
     plaintext token → hashed token.
  =================================================== */

  if (!device) {

    const legacyDevice =
      await devices.findOne({
        token: deviceToken
      });

    if (legacyDevice) {

      await devices.updateOne(

        {
          _id:
            legacyDevice._id
        },

        {
          $set: {
            tokenHash,
            updatedAt:
              new Date()
          },

          $unset: {
            token: ""
          }
        }

      );

      device =
        await devices.findOne({
          _id:
            legacyDevice._id
        });
    }
  }

  /* ===================================================
     INVALID DEVICE
  =================================================== */

  if (!device) {

    return response(
      {
        success: false,
        error: "INVALID_DEVICE"
      },
      401
    );
  }

  /* ===================================================
     DEVICE STATUS
  =================================================== */

  if (device.status === "revoked") {

    return response(
      {
        success: false,
        error: "DEVICE_REVOKED"
      },
      403
    );
  }

  const deviceId =
    device.deviceId;

  /* ===================================================
     POLICY
  =================================================== */

  let policy =
    await policies.findOne({
      deviceId
    });

  if (!policy) {

    policy = {

      deviceId,

      instagram: true,
      snapchat: true,
      youtube: true,

      createdAt:
        new Date(),

      updatedAt:
        new Date()
    };

    await policies.insertOne(
      policy
    );
  }

  /* ===================================================
     GET STATUS
  =================================================== */

  if (req.method === "GET") {

    const activeSession =
      await sessions.findOne({

        deviceId,

        status: "active"

      });

    /* -----------------------------------------------
       AUTO EXPIRY
    ----------------------------------------------- */

    if (
      activeSession &&
      new Date(activeSession.expiresAt)
        .getTime() <= Date.now()
    ) {

      return response({

        success: true,

        device: {

          deviceId,

          status:
            device.status || "active"

        },

        session: {

          active: true,

          expired: true,

          startedAt:
            activeSession.startedAt,

          expiresAt:
            activeSession.expiresAt

        },

        policy: {

          instagram:
            policy.instagram,

          snapchat:
            policy.snapchat,

          youtube:
            policy.youtube

        }

      });
    }

    return response({

      success: true,

      device: {

        deviceId,

        status:
          device.status || "active"

      },

      session:

        activeSession

          ? {

              active: true,

              expired: false,

              startedAt:
                activeSession.startedAt,

              expiresAt:
                activeSession.expiresAt

            }

          : {

              active: false,

              expired: false,

              startedAt: null,

              expiresAt: null

            },

      policy: {

        instagram:
          policy.instagram,

        snapchat:
          policy.snapchat,

        youtube:
          policy.youtube

      }

    });
  }

  /* ===================================================
     POST
  =================================================== */

  if (req.method === "POST") {

    let body;

    try {

      body =
        await req.json();

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

      /* -----------------------------------------------
         CHECK ACTIVE SESSION
      ----------------------------------------------- */

      const existingSession =
        await sessions.findOne({

          deviceId,

          status: "active"

        });

      if (existingSession) {

        const expiry =
          new Date(
            existingSession.expiresAt
          ).getTime();

        /* ---------------------------------------------
           EXPIRED SESSION
        --------------------------------------------- */

        if (
          expiry <= Date.now()
        ) {

          await sessions.updateOne(

            {
              _id:
                existingSession._id
            },

            {
              $set: {

                status:
                  "expired",

                expiredAt:
                  new Date()

              }

            }

          );

        } else {

          return response(
            {
              success: false,

              error:
                "SESSION_ALREADY_ACTIVE",

              expiresAt:
                existingSession.expiresAt
            },
            409
          );
        }
      }

      /* -----------------------------------------------
         BLOCK DNS
      ----------------------------------------------- */

      const result =
        await blockAllDomains(
          policy
        );

      if (!result.success) {

        return response(
          {
            success: false,

            error:
              "DNS_BLOCK_FAILED",

            details:
              result

          },
          500
        );
      }

      /* -----------------------------------------------
         SESSION TIMES
      ----------------------------------------------- */

      const startedAt =
        new Date();

      const expiresAt =
        new Date(
          startedAt.getTime() +
          FOCUS_DURATION
        );

      /* -----------------------------------------------
         CREATE SESSION
      ----------------------------------------------- */

      await sessions.insertOne({

        deviceId,

        status:
          "active",

        startedAt,

        expiresAt,

        createdAt:
          new Date()

      });

      /* -----------------------------------------------
         DEVICE → FOCUS
      ----------------------------------------------- */

      await devices.updateOne(

        {
          deviceId
        },

        {
          $set: {

            status:
              "focus",

            updatedAt:
              new Date()

          }

        }

      );

      return response({

        success: true,

        message:
          "TACTIC SESSION STARTED",

        deviceId,

        blockedDomains:
          result.results
            .filter(
              item => item.success
            )
            .map(
              item => item.domain
            ),

        startedAt,

        expiresAt

      });
    }

    /* =================================================
       COMPLETE SESSION
    ================================================= */

    if (
      body.action === "complete"
    ) {

      const activeSession =
        await sessions.findOne({

          deviceId,

          status:
            "active"

        });

      if (!activeSession) {

        return response(
          {
            success: false,

            error:
              "NO_ACTIVE_SESSION"
          },
          400
        );
      }

      /* -----------------------------------------------
         EXPIRY CHECK
      ----------------------------------------------- */

      const now =
        Date.now();

      const expiry =
        new Date(
          activeSession.expiresAt
        ).getTime();

      if (now < expiry) {

        return response(
          {
            success: false,

            error:
              "SESSION_NOT_FINISHED",

            remaining:
              expiry - now

          },
          403
        );
      }

      /* -----------------------------------------------
         RESTORE DNS
      ----------------------------------------------- */

      const result =
        await restoreAllDomains(
          policy
        );

      if (!result.success) {

        return response(
          {
            success: false,

            error:
              "DNS_RESTORE_FAILED",

            details:
              result

          },
          500
        );
      }

      /* -----------------------------------------------
         COMPLETE SESSION
      ----------------------------------------------- */

      await sessions.updateOne(

        {
          _id:
            activeSession._id
        },

        {
          $set: {

            status:
              "completed",

            completedAt:
              new Date()

          }

        }

      );

      /* -----------------------------------------------
         DEVICE READY
      ----------------------------------------------- */

      await devices.updateOne(

        {
          deviceId
        },

        {
          $set: {

            status:
              "active",

            updatedAt:
              new Date()

          }

        }

      );

      return response({

        success: true,

        message:
          "TACTIC SESSION COMPLETED",

        restoredDomains:
          result.results
            .filter(
              item => item.success
            )
            .map(
              item => item.domain
            )

      });
    }

    /* =================================================
       UNKNOWN ACTION
    ================================================= */

    return response(
      {
        success: false,

        error:
          "UNKNOWN_ACTION"
      },
      400
    );
  }

  /* ===================================================
     METHOD NOT ALLOWED
  =================================================== */

  return response(
    {
      success: false,

      error:
        "METHOD_NOT_ALLOWED"
    },
    405
  );
}


/* =====================================================
   NEXTDNS — BLOCK
===================================================== */

async function blockAllDomains(
  policy
) {

  const profile =
    process.env.NEXTDNS_PROFILE_ID;

  const apiKey =
    process.env.NEXTDNS_API_KEY;

  if (!profile || !apiKey) {

    return {

      success: false,

      error:
        "NEXTDNS_CONFIG_MISSING"

    };
  }

  const domainsToBlock =
    DOMAINS.filter(
      domain => {

        if (
          domain ===
          "instagram.com"
        ) {
          return policy.instagram;
        }

        if (
          domain ===
          "snapchat.com"
        ) {
          return policy.snapchat;
        }

        if (
          domain ===
          "youtube.com"
        ) {
          return policy.youtube;
        }

        return false;

      }
    );

  const results = [];

  for (
    const domain of
    domainsToBlock
  ) {

    try {

      const url =
        `https://api.nextdns.io/profiles/${profile}/denylist`;

      const res =
        await fetch(
          url,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json",

              "X-Api-Key":
                apiKey

            },

            body:
              JSON.stringify({

                id:
                  domain,

                active:
                  true

              })

          }
        );

      results.push({

        domain,

        status:
          res.status,

        success:
          res.ok

      });

    } catch (error) {

      results.push({

        domain,

        success:
          false,

        error:
          error.message

      });

    }

  }

  return {

    success:
      results.every(
        item =>
          item.success
      ),

    results

  };
}


/* =====================================================
   NEXTDNS — RESTORE
===================================================== */

async function restoreAllDomains(
  policy
) {

  const profile =
    process.env.NEXTDNS_PROFILE_ID;

  const apiKey =
    process.env.NEXTDNS_API_KEY;

  if (!profile || !apiKey) {

    return {

      success: false,

      error:
        "NEXTDNS_CONFIG_MISSING"

    };
  }

  const domainsToRestore =
    DOMAINS.filter(
      domain => {

        if (
          domain ===
          "instagram.com"
        ) {
          return policy.instagram;
        }

        if (
          domain ===
          "snapchat.com"
        ) {
          return policy.snapchat;
        }

        if (
          domain ===
          "youtube.com"
        ) {
          return policy.youtube;
        }

        return false;

      }
    );

  const results = [];

  for (
    const domain of
    domainsToRestore
  ) {

    try {

      const url =
        `https://api.nextdns.io/profiles/${profile}/denylist/${domain}`;

      const res =
        await fetch(
          url,
          {

            method:
              "PATCH",

            headers: {

              "Content-Type":
                "application/json",

              "X-Api-Key":
                apiKey

            },

            body:
              JSON.stringify({

                active:
                  false

              })

          }
        );

      results.push({

        domain,

        status:
          res.status,

        success:
          res.ok

      });

    } catch (error) {

      results.push({

        domain,

        success:
          false,

        error:
          error.message

      });

    }

  }

  return {

    success:
      results.every(
        item =>
          item.success
      ),

    results

  };
}


/* =====================================================
   DEVICE REGISTRATION HELPER

   Future admin/register endpoint can use:

   const deviceId =
     await generateDeviceId(devices);

   const rawToken =
     generateDeviceToken();

   const tokenHash =
     hashToken(rawToken);

   await devices.insertOne({
     deviceId,
     tokenHash,
     status: "active",
     createdAt: new Date(),
     updatedAt: new Date()
   });

   IMPORTANT:
   rawToken should be shown ONLY ONCE
   during device provisioning.
===================================================== */