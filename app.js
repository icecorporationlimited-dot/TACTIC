/* =====================================================
   TACTIC FRONTEND
===================================================== */


/* =====================================================
   CONFIG
===================================================== */

const API_URL =
  "/.netlify/functions/tactic";


/*
   PROTOTYPE TOKEN

   Later this should NOT be exposed in frontend JS.

   For now the backend should be tested with the
   ESP32/device token.

*/

const DEVICE_TOKEN =
  "YOUR_DEVICE_TOKEN";


/* =====================================================
   DOM
===================================================== */

const timerElement =
  document.getElementById("timer");

const timerStatus =
  document.getElementById("timerStatus");

const connectionText =
  document.getElementById("connectionText");

const deviceState =
  document.getElementById("deviceState");

const deviceStatus =
  document.getElementById("deviceStatus");

const modeText =
  document.getElementById("modeText");

const sessionText =
  document.getElementById("sessionText");

const systemLog =
  document.getElementById("systemLog");

const deviceDot =
  document.getElementById("deviceDot");


/* =====================================================
   SESSION
===================================================== */

let session = {

  active: false,

  startedAt: null,

  expiresAt: null

};


/* =====================================================
   API REQUEST
===================================================== */

async function apiRequest(
  method = "GET",
  body = null
) {

  const options = {

    method,

    headers: {

      "Authorization":
        `Bearer ${DEVICE_TOKEN}`,

      "Content-Type":
        "application/json"

    }

  };


  if (body) {

    options.body =
      JSON.stringify(body);
  }


  const response =
    await fetch(
      API_URL,
      options
    );


  const data =
    await response.json();


  if (
    !response.ok
  ) {

    throw new Error(
      data.error ||
      "API request failed"
    );
  }


  return data;
}


/* =====================================================
   LOAD STATUS
===================================================== */

async function loadStatus() {

  try {

    const data =
      await apiRequest(
        "GET"
      );


    connectionText.textContent =
      "SYSTEM ONLINE";


    deviceStatus.textContent =
      "CONNECTED";


    deviceDot.style.background =
      "var(--green)";


    if (
      data.session
    ) {

      session.active =
        data.session.active;

      session.startedAt =
        data.session.startedAt;

      session.expiresAt =
        data.session.expiresAt;
    }


    updateUI();


    addLog(
      "BACKEND CONNECTED"
    );

  }

  catch (
    error
  ) {

    connectionText.textContent =
      "SYSTEM OFFLINE";


    deviceStatus.textContent =
      "OFFLINE";


    deviceDot.style.background =
      "var(--danger)";


    addLog(
      "BACKEND CONNECTION FAILED"
    );


    console.error(
      error
    );
  }
}


/* =====================================================
   START SESSION
===================================================== */

async function startSession() {

  if (
    session.active
  ) {

    return;
  }


  timerStatus.textContent =
    "CONTACTING TACTIC";


  addLog(
    "START REQUEST SENT"
  );


  try {

    const data =
      await apiRequest(
        "POST",
        {
          action: "start"
        }
      );


    session.active =
      true;


    session.startedAt =
      data.startedAt;


    session.expiresAt =
      data.expiresAt;


    addLog(
      "FOCUS SESSION STARTED"
    );


    updateUI();

  }

  catch (
    error
  ) {

    timerStatus.textContent =
      "START FAILED";


    addLog(
      "SESSION START FAILED"
    );


    console.error(
      error
    );
  }
}


/* =====================================================
   COMPLETE SESSION
===================================================== */

async function completeSession() {

  try {

    const data =
      await apiRequest(
        "POST",
        {
          action: "complete"
        }
      );


    if (
      data.success
    ) {

      session.active =
        false;

      session.startedAt =
        null;

      session.expiresAt =
        null;


      addLog(
        "SESSION COMPLETED"
      );


      updateUI();
    }

  }

  catch (
    error
  ) {

    addLog(
      "DNS RESTORE FAILED"
    );


    console.error(
      error
    );
  }
}


/* =====================================================
   TIMER
===================================================== */

function updateTimer() {

  if (
    !session.active ||
    !session.expiresAt
  ) {

    timerElement.textContent =
      "45:00";

    timerStatus.textContent =
      "READY TO START";

    return;
  }


  const now =
    Date.now();


  let remaining =
    Math.max(
      0,
      session.expiresAt - now
    );


  // ----------------------------------------------------
  // Convert milliseconds
  // ----------------------------------------------------

  const totalSeconds =
    Math.floor(
      remaining / 1000
    );


  const minutes =
    Math.floor(
      totalSeconds / 60
    );


  const seconds =
    totalSeconds % 60;


  timerElement.textContent =

    String(minutes)
      .padStart(2, "0")

    +

    ":"

    +

    String(seconds)
      .padStart(2, "0");


  timerStatus.textContent =
    "FOCUS MODE ACTIVE";


  // ----------------------------------------------------
  // Finished
  // ----------------------------------------------------

  if (
    remaining <= 0
  ) {

    completeSession();
  }
}


/* =====================================================
   UPDATE UI
===================================================== */

function updateUI() {

  if (
    session.active
  ) {

    deviceState.textContent =
      "FOCUS ACTIVE";


    modeText.textContent =
      "FOCUS";


    sessionText.textContent =
      "ACTIVE";


    timerStatus.textContent =
      "FOCUS MODE ACTIVE";

  }

  else {

    deviceState.textContent =
      "READY";


    modeText.textContent =
      "IDLE";


    sessionText.textContent =
      "NONE";


    timerStatus.textContent =
      "READY TO START";
  }
}


/* =====================================================
   SYSTEM LOG
===================================================== */

function addLog(
  message
) {

  const now =
    new Date();


  const time =
    now.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    );


  const row =
    document.createElement(
      "div"
    );


  row.innerHTML = `

    <span>
      ${time}
    </span>

    <strong>
      ${message}
    </strong>

  `;


  systemLog.prepend(
    row
  );


  // Keep only last 8 logs

  while (
    systemLog.children.length > 8
  ) {

    systemLog.removeChild(
      systemLog.lastChild
    );
  }
}


/* =====================================================
   AUTO STATUS POLLING
===================================================== */

async function pollStatus() {

  try {

    const data =
      await apiRequest(
        "GET"
      );


    if (
      data.session
    ) {

      session.active =
        data.session.active;

      session.startedAt =
        data.session.startedAt;

      session.expiresAt =
        data.session.expiresAt;
    }


    updateUI();

  }

  catch (
    error
  ) {

    console.log(
      "Status polling failed"
    );
  }
}


/* =====================================================
   INITIALIZATION
===================================================== */

async function init() {

  addLog(
    "TACTIC FRONTEND INITIALIZED"
  );


  await loadStatus();


  setInterval(
    updateTimer,
    1000
  );


  setInterval(
    pollStatus,
    10000
  );
}


/* =====================================================
   START
===================================================== */

init();