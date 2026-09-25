const DOMAINS = [
  "instagram.com",
  "snapchat.com",
  "youtube.com"
];

const FOCUS_DURATION = 45 * 60 * 1000;

let session = {
  active: false,
  startedAt: null,
  expiresAt: null
};


export default async (req) => {

  // =====================================================
  // BASIC CORS
  // =====================================================

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };


  // =====================================================
  // OPTIONS
  // =====================================================

  if (req.method === "OPTIONS") {

    return new Response(
      null,
      {
        status: 204,
        headers
      }
    );
  }


  // =====================================================
  // DEVICE AUTH
  // =====================================================

  const auth =
    req.headers.get("Authorization");

  const expectedToken =
    process.env.TACTIC_DEVICE_TOKEN;


  if (
    !auth ||
    !expectedToken ||
    auth !== `Bearer ${expectedToken}`
  ) {

    return new Response(

      JSON.stringify({
        success: false,
        error: "UNAUTHORIZED"
      }),

      {
        status: 401,
        headers
      }
    );
  }


  // =====================================================
  // GET STATUS
  // =====================================================

  if (req.method === "GET") {

    return new Response(

      JSON.stringify({
        success: true,

        session: {
          active: session.active,

          startedAt:
            session.startedAt,

          expiresAt:
            session.expiresAt
        }
      }),

      {
        status: 200,
        headers
      }
    );
  }


  // =====================================================
  // POST
  // =====================================================

  if (req.method === "POST") {

    let body;

    try {

      body =
        await req.json();

    }

    catch {

      return new Response(

        JSON.stringify({
          success: false,
          error: "INVALID_JSON"
        }),

        {
          status: 400,
          headers
        }
      );
    }


    // ===================================================
    // START SESSION
    // ===================================================

    if (
      body.action === "start"
    ) {

      if (
        session.active
      ) {

        return new Response(

          JSON.stringify({
            success: false,
            error: "SESSION_ALREADY_ACTIVE",

            expiresAt:
              session.expiresAt
          }),

          {
            status: 409,
            headers
          }
        );
      }


      // -----------------------------------------------
      // Block domains
      // -----------------------------------------------

      const result =
        await blockAllDomains();


      if (
        !result.success
      ) {

        return new Response(

          JSON.stringify({
            success: false,
            error: "DNS_BLOCK_FAILED",
            details: result
          }),

          {
            status: 500,
            headers
          }
        );
      }


      // -----------------------------------------------
      // Create session
      // -----------------------------------------------

      const now =
        Date.now();

      const expires =
        now + FOCUS_DURATION;


      session.active =
        true;

      session.startedAt =
        now;

      session.expiresAt =
        expires;


      return new Response(

        JSON.stringify({

          success: true,

          message:
            "TACTIC SESSION STARTED",

          blockedDomains:
            DOMAINS,

          startedAt:
            now,

          expiresAt:
            expires
        }),

        {
          status: 200,
          headers
        }
      );
    }


    // ===================================================
    // COMPLETE SESSION
    // ===================================================

    if (
      body.action === "complete"
    ) {

      if (
        !session.active
      ) {

        return new Response(

          JSON.stringify({
            success: false,
            error: "NO_ACTIVE_SESSION"
          }),

          {
            status: 400,
            headers
          }
        );
      }


      // -----------------------------------------------
      // Don't allow early completion
      // -----------------------------------------------

      if (
        Date.now() <
        session.expiresAt
      ) {

        return new Response(

          JSON.stringify({
            success: false,
            error: "SESSION_NOT_FINISHED",

            remaining:
              session.expiresAt -
              Date.now()
          }),

          {
            status: 403,
            headers
          }
        );
      }


      // -----------------------------------------------
      // Restore DNS
      // -----------------------------------------------

      const result =
        await restoreAllDomains();


      if (
        !result.success
      ) {

        return new Response(

          JSON.stringify({
            success: false,
            error: "DNS_RESTORE_FAILED",
            details: result
          }),

          {
            status: 500,
            headers
          }
        );
      }


      session.active =
        false;

      session.startedAt =
        null;

      session.expiresAt =
        null;


      return new Response(

        JSON.stringify({

          success: true,

          message:
            "TACTIC SESSION COMPLETED",

          restoredDomains:
            DOMAINS

        }),

        {
          status: 200,
          headers
        }
      );
    }


    // ===================================================
    // UNKNOWN ACTION
    // ===================================================

    return new Response(

      JSON.stringify({
        success: false,
        error: "UNKNOWN_ACTION"
      }),

      {
        status: 400,
        headers
      }
    );
  }


  // =====================================================
  // METHOD NOT ALLOWED
  // =====================================================

  return new Response(

    JSON.stringify({
      success: false,
      error: "METHOD_NOT_ALLOWED"
    }),

    {
      status: 405,
      headers
    }
  );
};


// ========================================================
// BLOCK ALL DOMAINS
// ========================================================

async function blockAllDomains() {

  const profile =
    process.env.NEXTDNS_PROFILE_ID;

  const apiKey =
    process.env.NEXTDNS_API_KEY;


  if (
    !profile ||
    !apiKey
  ) {

    return {
      success: false,
      error: "NEXTDNS_CONFIG_MISSING"
    };
  }


  const results = [];


  for (
    const domain of DOMAINS
  ) {

    const url =
      `https://api.nextdns.io/profiles/${profile}/denylist`;


    const response =
      await fetch(
        url,
        {

          method: "POST",

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
        response.status,

      success:
        response.ok

    });
  }


  const success =
    results.every(
      item => item.success
    );


  return {

    success,

    results

  };
}


// ========================================================
// RESTORE ALL DOMAINS
// ========================================================
//
// FIRST VERSION:
//
// Set domains inactive.
//
// Later we'll make this smarter and preserve each
// domain's original state.
//

async function restoreAllDomains() {

  const profile =
    process.env.NEXTDNS_PROFILE_ID;

  const apiKey =
    process.env.NEXTDNS_API_KEY;


  if (
    !profile ||
    !apiKey
  ) {

    return {
      success: false,
      error: "NEXTDNS_CONFIG_MISSING"
    };
  }


  const results = [];


  for (
    const domain of DOMAINS
  ) {

    const url =
      `https://api.nextdns.io/profiles/${profile}/denylist/${domain}`;


    const response =
      await fetch(
        url,
        {

          method: "PATCH",

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
        response.status,

      success:
        response.ok

    });
  }


  const success =
    results.every(
      item => item.success
    );


  return {

    success,

    results

  };
}