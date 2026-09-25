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
   PASSWORD HASH
===================================================== */

function hashPassword(password) {

  const salt =
    crypto.randomBytes(16);

  const hash =
    crypto.scryptSync(
      password,
      salt,
      64
    );

  return [
    salt.toString("hex"),
    hash.toString("hex")
  ].join(":");
}


/* =====================================================
   PASSWORD VERIFY
===================================================== */

function verifyPassword(
  password,
  stored
) {

  try {

    const [
      saltHex,
      hashHex
    ] = stored.split(":");

    const salt =
      Buffer.from(
        saltHex,
        "hex"
      );

    const originalHash =
      Buffer.from(
        hashHex,
        "hex"
      );

    const testHash =
      crypto.scryptSync(
        password,
        salt,
        64
      );

    return (
      originalHash.length ===
      testHash.length &&
      crypto.timingSafeEqual(
        originalHash,
        testHash
      )
    );

  } catch {

    return false;
  }
}


/* =====================================================
   SESSION TOKEN
===================================================== */

function createSessionToken() {

  return crypto
    .randomBytes(48)
    .toString("hex");
}


/* =====================================================
   MAIN
===================================================== */

export default async function handler(
  req
) {

  /* ===================================================
     CORS
  =================================================== */

  if (
    req.method === "OPTIONS"
  ) {

    return new Response(
      null,
      {
        status: 204,

        headers: {
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


  /* ===================================================
     POST ONLY
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
     BODY
  =================================================== */

  let body;

  try {

    body =
      await req.json();

  } catch {

    return response(
      {
        success: false,
        error:
          "INVALID_JSON"
      },
      400
    );
  }


  const action =
    body.action;


  /* ===================================================
     DATABASE
  =================================================== */

  let db;

  try {

    db =
      await getDB();

  } catch (error) {

    console.error(
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


  const users =
    db.collection(
      "users"
    );

  const authSessions =
    db.collection(
      "authSessions"
    );


  /* ===================================================
     REGISTER
  =================================================== */

  if (
    action === "register"
  ) {

    const email =
      String(
        body.email || ""
      )
      .trim()
      .toLowerCase();

    const password =
      String(
        body.password || ""
      );


    if (
      !email ||
      !password
    ) {

      return response(
        {
          success: false,
          error:
            "EMAIL_AND_PASSWORD_REQUIRED"
        },
        400
      );
    }


    if (
      password.length < 8
    ) {

      return response(
        {
          success: false,
          error:
            "PASSWORD_TOO_SHORT"
        },
        400
      );
    }


    const existing =
      await users.findOne({
        email
      });


    if (existing) {

      return response(
        {
          success: false,
          error:
            "EMAIL_ALREADY_EXISTS"
        },
        409
      );
    }


    const now =
      new Date();


    const user = {

      email,

      passwordHash:
        hashPassword(
          password
        ),

      createdAt:
        now,

      updatedAt:
        now

    };


    const result =
      await users.insertOne(
        user
      );


    return response({

      success: true,

      message:
        "ACCOUNT_CREATED",

      userId:
        result.insertedId
          .toString()

    }, 201);
  }


  /* ===================================================
     LOGIN
  =================================================== */

  if (
    action === "login"
  ) {

    const email =
      String(
        body.email || ""
      )
      .trim()
      .toLowerCase();

    const password =
      String(
        body.password || ""
      );


    if (
      !email ||
      !password
    ) {

      return response(
        {
          success: false,
          error:
            "EMAIL_AND_PASSWORD_REQUIRED"
        },
        400
      );
    }


    const user =
      await users.findOne({
        email
      });


    if (
      !user ||
      !verifyPassword(
        password,
        user.passwordHash
      )
    ) {

      return response(
        {
          success: false,
          error:
            "INVALID_CREDENTIALS"
        },
        401
      );
    }


    /* -----------------------------------------------
       CREATE AUTH SESSION
    ----------------------------------------------- */

    const token =
      createSessionToken();


    const now =
      new Date();


    const expiresAt =
      new Date(
        now.getTime() +
        7 * 24 * 60 * 60 * 1000
      );


    await authSessions.insertOne({

      userId:
        user._id,

      tokenHash:
        crypto
          .createHash("sha256")
          .update(token)
          .digest("hex"),

      createdAt:
        now,

      expiresAt

    });


    return response({

      success: true,

      message:
        "LOGIN_SUCCESS",

      token,

      user: {

        userId:
          user._id.toString(),

        email:
          user.email

      },

      expiresAt

    });
  }


  /* ===================================================
     LOGOUT
  =================================================== */

  if (
    action === "logout"
  ) {

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
            "UNAUTHORIZED"
        },
        401
      );
    }


    const token =
      auth
        .slice(7)
        .trim();


    const tokenHash =
      crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");


    await authSessions.deleteOne({

      tokenHash

    });


    return response({

      success: true,

      message:
        "LOGOUT_SUCCESS"

    });
  }


  /* ===================================================
     UNKNOWN
  =================================================== */

  return response(
    {
      success: false,

      error:
        "UNKNOWN_ACTION"
    },
    400
  );
}