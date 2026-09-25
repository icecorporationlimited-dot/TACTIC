import { MongoClient } from "mongodb";
import crypto from "crypto";

let mongoClient;

/* =====================================================
   MONGODB
===================================================== */

async function getDB() {

  if (!mongoClient) {

    const uri =
      process.env.MONGODB_URI;

    if (!uri) {
      throw new Error(
        "MONGODB_URI is missing"
      );
    }

    mongoClient =
      new MongoClient(uri);

    await mongoClient.connect();
  }

  return mongoClient.db("tactic");
}


/* =====================================================
   RESPONSE
===================================================== */

function response(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",

        "Access-Control-Allow-Methods":
          "POST, OPTIONS"
      }
    }
  );
}


/* =====================================================
   HASH TOKEN
===================================================== */

function hashToken(token) {

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}


/* =====================================================
   GENERATE SECURE TOKEN
===================================================== */

function generateToken() {

  const random =
    crypto.randomBytes(32)
      .toString("hex");

  return `TACTIC-${random}`;
}


/* =====================================================
   GENERATE DEVICE ID
===================================================== */

async function generateDeviceId(
  devices
) {

  const latest =
    await devices
      .find({
        deviceId: {
          $regex:
            /^TAC-\d{6}$/
        }
      })
      .sort({
        deviceId: -1
      })
      .limit(1)
      .next();

  let number = 1;

  if (latest?.deviceId) {

    const match =
      latest.deviceId.match(
        /^TAC-(\d{6})$/
      );

    if (match) {

      number =
        parseInt(
          match[1],
          10
        ) + 1;
    }
  }

  return `TAC-${String(number)
    .padStart(6, "0")}`;
}


/* =====================================================
   MAIN HANDLER
===================================================== */

export default async function handler(
  req
) {

  /* ===================================================
     OPTIONS
  =================================================== */

  if (
    req.method === "OPTIONS"
  ) {

    return response(
      {},
      204
    );
  }


  /* ===================================================
     ONLY POST
  =================================================== */

  if (
    req.method !== "POST"
  ) {

    return response(
      {
        success: false,
        error:
          "METHOD_NOT_ALLOWED"
      },
      405
    );
  }


  /* ===================================================
     ADMIN AUTHENTICATION
  =================================================== */

  const auth =
    req.headers.get(
      "Authorization"
    );

  if (
    !auth ||
    !auth.startsWith(
      "Bearer "
    )
  ) {

    return response(
      {
        success: false,
        error:
          "ADMIN_UNAUTHORIZED"
      },
      401
    );
  }


  const suppliedSecret =
    auth
      .slice(7)
      .trim();

  const adminSecret =
    process.env
      .TACTIC_ADMIN_SECRET;


  if (
    !adminSecret ||
    !suppliedSecret
  ) {

    return response(
      {
        success: false,
        error:
          "ADMIN_CONFIG_MISSING"
      },
      500
    );
  }


  /* ===================================================
     CONSTANT-TIME SECRET CHECK
  =================================================== */

  const suppliedBuffer =
    Buffer.from(
      suppliedSecret
    );

  const adminBuffer =
    Buffer.from(
      adminSecret
    );

  const validLength =
    suppliedBuffer.length ===
    adminBuffer.length;

  let valid = false;

  if (validLength) {

    valid =
      crypto.timingSafeEqual(
        suppliedBuffer,
        adminBuffer
      );
  }


  if (!valid) {

    return response(
      {
        success: false,
        error:
          "ADMIN_UNAUTHORIZED"
      },
      401
    );
  }


  /* ===================================================
     DATABASE
  =================================================== */

  let db;

  try {

    db =
      await getDB();

  } catch (error) {

    console.error(
      "MongoDB connection error:",
      error
    );

    return response(
      {
        success: false,

        error:
          "DATABASE_CONNECTION_FAILED"
      },
      500
    );
  }


  const devices =
    db.collection(
      "devices"
    );


  /* ===================================================
     GENERATE DEVICE
  =================================================== */

  let deviceId;

  let rawToken;

  let tokenHash;

  let attempts = 0;


  while (attempts < 5) {

    attempts++;

    deviceId =
      await generateDeviceId(
        devices
      );

    rawToken =
      generateToken();

    tokenHash =
      hashToken(
        rawToken
      );


    const existing =
      await devices.findOne({

        $or: [

          {
            deviceId
          },

          {
            tokenHash
          }

        ]

      });


    if (!existing) {
      break;
    }


    if (attempts >= 5) {

      return response(
        {
          success: false,

          error:
            "DEVICE_GENERATION_FAILED"
        },
        500
      );
    }
  }


  /* ===================================================
     CREATE DEVICE
  =================================================== */

  const now =
    new Date();


  const device = {

    deviceId,

    tokenHash,

    status:
      "active",

    userId:
      null,

    createdAt:
      now,

    updatedAt:
      now

  };


  try {

    await devices.insertOne(
      device
    );

  } catch (error) {

    console.error(
      "Device creation error:",
      error
    );

    return response(
      {
        success: false,

        error:
          "DEVICE_CREATION_FAILED"
      },
      500
    );
  }


  /* ===================================================
     RESPONSE
     
     RAW TOKEN IS RETURNED ONLY NOW.
     It is NOT stored in MongoDB.
  =================================================== */

  return response({

    success: true,

    message:
      "TACTIC DEVICE CREATED",

    device: {

      deviceId,

      status:
        "active"

    },

    credentials: {

      token:
        rawToken

    },

    warning:
      "SAVE THIS TOKEN. IT WILL NOT BE SHOWN AGAIN."

  });
}