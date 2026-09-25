/* =====================================================
   TACTIC
   FRONTEND APP
===================================================== */

const API_URL = "/.netlify/functions/tactic";
const AUTH_URL = "/.netlify/functions/auth";
const DEVICES_URL = "/.netlify/functions/my-devices";
const ACTIVATE_URL = "/.netlify/functions/activate-device";

/* =====================================================
   STORAGE
===================================================== */

let sessionToken =
  localStorage.getItem("tactic_session");

let currentUser = JSON.parse(
  localStorage.getItem("tactic_user") || "null"
);

let selectedDevice =
  localStorage.getItem("tactic_device");

let timerInterval = null;
let remainingSeconds = 0;


/* =====================================================
   DOM
===================================================== */

const loginScreen =
  document.getElementById("loginScreen");

const appScreen =
  document.getElementById("appScreen");

const loginForm =
  document.getElementById("loginForm");

const registerForm =
  document.getElementById("registerForm");

const authTitle =
  document.getElementById("authTitle");

const switchAuth =
  document.getElementById("switchAuth");

const emailInput =
  document.getElementById("emailInput");

const passwordInput =
  document.getElementById("passwordInput");

const registerEmail =
  document.getElementById("registerEmail");

const registerPassword =
  document.getElementById("registerPassword");

const registerPasswordConfirm =
  document.getElementById("registerPasswordConfirm");

const loginMessage =
  document.getElementById("loginMessage");

const deviceSelect =
  document.getElementById("deviceSelect");

const refreshDevices =
  document.getElementById("refreshDevices");

const deviceListMessage =
  document.getElementById("deviceListMessage");

const logoutButton =
  document.getElementById("logoutButton");

const startFocus =
  document.getElementById("startFocus");

const timer =
  document.getElementById("timer");

const timerStatus =
  document.getElementById("timerStatus");

const deviceName =
  document.getElementById("deviceName");

const deviceState =
  document.getElementById("deviceState");

const deviceStatus =
  document.getElementById("deviceStatus");

const modeText =
  document.getElementById("modeText");

const sessionText =
  document.getElementById("sessionText");

const blockedCount =
  document.getElementById("blockedCount");

const instagramState =
  document.getElementById("instagramState");

const snapchatState =
  document.getElementById("snapchatState");

const youtubeState =
  document.getElementById("youtubeState");

const systemLog =
  document.getElementById("systemLog");

const activationCode =
  document.getElementById("activationCode");

const activateDevice =
  document.getElementById("activateDevice");

const activationMessage =
  document.getElementById("activationMessage");

const activationBox =
  document.getElementById("activationBox");


/* =====================================================
   AUTH MODE
===================================================== */

let registerMode = false;

switchAuth?.addEventListener("click", () => {

  registerMode = !registerMode;

  if (registerMode) {

    authTitle.textContent =
      "CREATE TACTIC ACCOUNT";

    loginForm.style.display =
      "none";

    registerForm.style.display =
      "block";

    switchAuth.textContent =
      "ALREADY HAVE AN ACCOUNT? LOGIN";

    loginMessage.textContent =
      "";

  } else {

    authTitle.textContent =
      "LOGIN TO TACTIC";

    loginForm.style.display =
      "block";

    registerForm.style.display =
      "none";

    switchAuth.textContent =
      "CREATE A NEW ACCOUNT";

    loginMessage.textContent =
      "";

  }

});


/* =====================================================
   API REQUEST
===================================================== */

async function apiRequest(
  url,
  method = "GET",
  body = null
) {

  const options = {
    method,
    headers: {}
  };

  if (sessionToken) {

    options.headers.Authorization =
      `Bearer ${sessionToken}`;

  }

  if (body) {

    options.headers["Content-Type"] =
      "application/json";

    options.body =
      JSON.stringify(body);

  }

  const response =
    await fetch(url, options);

  let data = {};

  try {

    data =
      await response.json();

  } catch {

    data = {};

  }

  if (response.status === 401) {

    await logout(false);

    throw new Error(
      "SESSION_EXPIRED"
    );

  }

  if (!response.ok) {

    throw new Error(
      data.message ||
      data.error ||
      "REQUEST_FAILED"
    );

  }

  return data;

}


/* =====================================================
   LOGIN
===================================================== */

loginForm?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const email =
      emailInput.value.trim();

    const password =
      passwordInput.value;

    loginMessage.textContent =
      "AUTHENTICATING...";

    try {

      const response =
        await fetch(
          AUTH_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              action: "login",
              email,
              password
            })
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {

        throw new Error(
          result.message ||
          result.error ||
          "LOGIN_FAILED"
        );

      }

      sessionToken =
        result.token;

      currentUser =
        result.user;

      localStorage.setItem(
        "tactic_session",
        sessionToken
      );

      localStorage.setItem(
        "tactic_user",
        JSON.stringify(currentUser)
      );

      loginMessage.textContent =
        "LOGIN SUCCESSFUL";

      showApp();

      await loadDevices();

    } catch (error) {

      loginMessage.textContent =
        error.message ===
        "LOGIN_FAILED"
          ? "INVALID EMAIL OR PASSWORD"
          : error.message;

    }

  }
);


/* =====================================================
   REGISTER
===================================================== */

registerForm?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const email =
      registerEmail.value.trim();

    const password =
      registerPassword.value;

    const confirmPassword =
      registerPasswordConfirm.value;

    if (
      password !==
      confirmPassword
    ) {

      loginMessage.textContent =
        "PASSWORDS DO NOT MATCH";

      return;

    }

    if (password.length < 8) {

      loginMessage.textContent =
        "PASSWORD MUST BE AT LEAST 8 CHARACTERS";

      return;

    }

    loginMessage.textContent =
      "CREATING ACCOUNT...";

    try {

      const response =
        await fetch(
          AUTH_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              action: "register",
              email,
              password
            })
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {

        throw new Error(
          result.message ||
          result.error ||
          "REGISTRATION_FAILED"
        );

      }

      loginMessage.textContent =
        "ACCOUNT CREATED. YOU CAN LOGIN NOW.";

      registerMode =
        false;

      authTitle.textContent =
        "LOGIN TO TACTIC";

      loginForm.style.display =
        "block";

      registerForm.style.display =
        "none";

      switchAuth.textContent =
        "CREATE A NEW ACCOUNT";

      emailInput.value =
        email;

      passwordInput.value =
        "";

      registerEmail.value =
        "";

      registerPassword.value =
        "";

      registerPasswordConfirm.value =
        "";

    } catch (error) {

      loginMessage.textContent =
        error.message ||
        "REGISTRATION_FAILED";

    }

  }
);


/* =====================================================
   SHOW APP
===================================================== */

function showApp() {

  loginScreen.style.display =
    "none";

  appScreen.style.display =
    "block";

}


/* =====================================================
   LOAD DEVICES
===================================================== */

async function loadDevices() {

  if (!sessionToken) {
    return;
  }

  deviceListMessage.textContent =
    "LOADING DEVICES...";

  try {

    const data =
      await apiRequest(
        DEVICES_URL,
        "GET"
      );

    const devices =
      data.devices || [];

    deviceSelect.innerHTML =
      "";

    /* ---------------------------------------------
       NO DEVICES
    --------------------------------------------- */

    if (!devices.length) {

      deviceListMessage.textContent =
        "NO TACTIC DEVICE LINKED TO THIS ACCOUNT.";

      selectedDevice =
        null;

      localStorage.removeItem(
        "tactic_device"
      );

      if (activationBox) {

        activationBox.style.display =
          "block";

      }

      return;

    }

    /* ---------------------------------------------
       DEVICES EXIST
    --------------------------------------------- */

    if (activationBox) {

      activationBox.style.display =
        "none";

    }

    deviceListMessage.textContent =
      `${devices.length} DEVICE(S) AVAILABLE`;

    devices.forEach(device => {

      const option =
        document.createElement("option");

      option.value =
        device.deviceId;

      option.textContent =
        `${device.deviceId} — ${String(
          device.status || "active"
        ).toUpperCase()}`;

      deviceSelect.appendChild(
        option
      );

    });

    /* ---------------------------------------------
       RESTORE DEVICE
    --------------------------------------------- */

    const exists =
      devices.some(
        device =>
          device.deviceId ===
          selectedDevice
      );

    if (!exists) {

      selectedDevice =
        devices[0].deviceId;

    }

    deviceSelect.value =
      selectedDevice;

    localStorage.setItem(
      "tactic_device",
      selectedDevice
    );

    await loadDeviceStatus();

  } catch (error) {

    deviceListMessage.textContent =
      error.message;

    if (
      error.message !==
      "SESSION_EXPIRED"
    ) {

      addLog(
        "ERROR",
        error.message
      );

    }

  }

}


/* =====================================================
   ACTIVATE DEVICE
===================================================== */

activateDevice?.addEventListener(
  "click",
  async () => {

    const code =
      activationCode.value
        .trim()
        .toUpperCase();

    if (!code) {

      activationMessage.textContent =
        "ENTER YOUR ACTIVATION CODE";

      return;

    }

    activateDevice.disabled =
      true;

    activationMessage.textContent =
      "ACTIVATING DEVICE...";

    try {

      const response =
        await fetch(
          ACTIVATE_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${sessionToken}`
            },

            body: JSON.stringify({
              activationCode: code
            })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {

        throw new Error(
          data.message ||
          "ACTIVATION_FAILED"
        );

      }

      const newDevice =
        data.device;

      selectedDevice =
        newDevice.deviceId;

      localStorage.setItem(
        "tactic_device",
        selectedDevice
      );

      activationCode.value =
        "";

      activationMessage.textContent =
        `DEVICE ACTIVATED — ${newDevice.deviceId}`;

      addLog(
        "DEVICE",
        `DEVICE ${newDevice.deviceId} ACTIVATED`
      );

      await loadDevices();

      deviceSelect.value =
        selectedDevice;

      await loadDeviceStatus();

    } catch (error) {

      activationMessage.textContent =
        error.message;

    }

    activateDevice.disabled =
      false;

  }
);


/* =====================================================
   DEVICE CHANGE
===================================================== */

deviceSelect?.addEventListener(
  "change",
  async () => {

    selectedDevice =
      deviceSelect.value;

    localStorage.setItem(
      "tactic_device",
      selectedDevice
    );

    await loadDeviceStatus();

  }
);


/* =====================================================
   REFRESH DEVICES
===================================================== */

refreshDevices?.addEventListener(
  "click",
  async () => {

    await loadDevices();

  }
);


/* =====================================================
   DEVICE STATUS
===================================================== */

async function loadDeviceStatus() {

  if (!selectedDevice) {
    return;
  }

  try {

    const url =
      `${API_URL}?deviceId=${encodeURIComponent(
        selectedDevice
      )}`;

    const data =
      await apiRequest(
        url,
        "GET"
      );

    updateDeviceUI(data);

  } catch (error) {

    if (
      error.message !==
      "SESSION_EXPIRED"
    ) {

      addLog(
        "ERROR",
        error.message
      );

    }

  }

}


/* =====================================================
   UPDATE DEVICE UI
===================================================== */

function updateDeviceUI(data) {

  const session =
    data.session || {};

  const policy =
    data.policy || {};

  const currentStatus =
    data.status ||
    data.device?.status ||
    "active";

  const currentDeviceId =
    data.deviceId ||
    data.device?.deviceId ||
    selectedDevice ||
    "UNKNOWN";


  /* ---------------------------------------------
     DEVICE
  --------------------------------------------- */

  if (deviceName) {

    deviceName.textContent =
      currentDeviceId;

  }

  if (deviceState) {

    deviceState.textContent =
      currentStatus.toUpperCase();

  }

  if (deviceStatus) {

    deviceStatus.textContent =
      currentStatus.toUpperCase();

  }

  if (modeText) {

    modeText.textContent =
      currentStatus === "focus"
        ? "FOCUS"
        : "STANDBY";

  }


  /* ---------------------------------------------
     SESSION
  --------------------------------------------- */

  const expiresAt =
    session.expiresAt
      ? new Date(
          session.expiresAt
        ).getTime()
      : 0;

  const now =
    Date.now();

  const sessionActive =
    expiresAt > now &&
    session.expired !== true;

  if (sessionActive) {

    remainingSeconds =
      Math.max(
        0,
        Math.floor(
          (
            expiresAt -
            now
          ) / 1000
        )
      );

    if (sessionText) {

      sessionText.textContent =
        "ACTIVE";

    }

    if (timerStatus) {

      timerStatus.textContent =
        "FOCUS SESSION ACTIVE";

    }

    if (startFocus) {

      startFocus.disabled =
        true;

    }

    startTimer();

  } else {

    stopTimer();

    if (sessionText) {

      sessionText.textContent =
        session.expired
          ? "EXPIRED"
          : "NONE";

    }

    if (timerStatus) {

      timerStatus.textContent =
        session.expired
          ? "SESSION COMPLETED"
          : "READY";

    }

    if (startFocus) {

      startFocus.disabled =
        false;

    }

  }

  updatePolicy(policy);

}


/* =====================================================
   POLICY
===================================================== */

function updatePolicy(policy) {

  const services = [
    {
      key: "instagram",
      element: instagramState
    },
    {
      key: "snapchat",
      element: snapchatState
    },
    {
      key: "youtube",
      element: youtubeState
    }
  ];

  let count = 0;

  services.forEach(
    service => {

      const blocked =
        policy[
          service.key
        ] === true;

      if (blocked) {

        count++;

      }

      if (service.element) {

        service.element.textContent =
          blocked
            ? "BLOCKED"
            : "AVAILABLE";

      }

    }
  );

  if (blockedCount) {

    blockedCount.textContent =
      count;

  }

}


/* =====================================================
   START FOCUS
===================================================== */

startFocus?.addEventListener(
  "click",
  async () => {

    if (!selectedDevice) {

      addLog(
        "ERROR",
        "NO DEVICE SELECTED"
      );

      return;

    }

    startFocus.disabled =
      true;

    timerStatus.textContent =
      "STARTING FOCUS...";

    try {

      const data =
        await apiRequest(
          API_URL,
          "POST",
          {
            action: "start",
            deviceId:
              selectedDevice
          }
        );

      addLog(
        "FOCUS",
        "FOCUS SESSION STARTED"
      );

      updateDeviceUI(data);

    } catch (error) {

      startFocus.disabled =
        false;

      timerStatus.textContent =
        "READY";

      addLog(
        "ERROR",
        error.message
      );

    }

  }
);


/* =====================================================
   COMPLETE SESSION
===================================================== */

async function completeSession() {

  if (!selectedDevice) {
    return;
  }

  try {

    const data =
      await apiRequest(
        API_URL,
        "POST",
        {
          action: "complete",
          deviceId:
            selectedDevice
        }
      );

    updateDeviceUI(data);

    addLog(
      "FOCUS",
      "FOCUS SESSION COMPLETED"
    );

  } catch (error) {

    addLog(
      "ERROR",
      error.message
    );

    /*
      Re-sync from backend instead of
      leaving the UI stuck.
    */

    await loadDeviceStatus();

  }

}


/* =====================================================
   TIMER
===================================================== */

function startTimer() {

  if (timerInterval) {
    updateTimerDisplay();
    return;
  }

  updateTimerDisplay();

  timerInterval =
    setInterval(
      async () => {

        if (
          remainingSeconds > 0
        ) {

          remainingSeconds--;

        }

        updateTimerDisplay();

        if (
          remainingSeconds <= 0
        ) {

          stopTimer();

          if (timerStatus) {

            timerStatus.textContent =
              "COMPLETING SESSION...";

          }

          await completeSession();

        }

      },
      1000
    );

}


function stopTimer() {

  if (timerInterval) {

    clearInterval(
      timerInterval
    );

    timerInterval =
      null;

  }

  remainingSeconds =
    0;

  updateTimerDisplay();

}


function updateTimerDisplay() {

  if (!timer) {
    return;
  }

  const minutes =
    Math.floor(
      remainingSeconds / 60
    );

  const seconds =
    remainingSeconds % 60;

  timer.textContent =
    `${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(
      2,
      "0"
    )}`;

}


/* =====================================================
   LOGOUT
===================================================== */

logoutButton?.addEventListener(
  "click",
  async () => {

    await logout(true);

  }
);


async function logout(
  callBackend = true
) {

  const token =
    sessionToken;

  if (
    callBackend &&
    token
  ) {

    try {

      await fetch(
        AUTH_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`
          },

          body: JSON.stringify({
            action: "logout"
          })
        }
      );

    } catch {}

  }

  sessionToken =
    null;

  currentUser =
    null;

  selectedDevice =
    null;

  localStorage.removeItem(
    "tactic_session"
  );

  localStorage.removeItem(
    "tactic_user"
  );

  localStorage.removeItem(
    "tactic_device"
  );

  stopTimer();

  appScreen.style.display =
    "none";

  loginScreen.style.display =
    "block";

  loginForm.style.display =
    "block";

  registerForm.style.display =
    "none";

  authTitle.textContent =
    "LOGIN TO TACTIC";

  switchAuth.textContent =
    "CREATE A NEW ACCOUNT";

  loginMessage.textContent =
    "";

}


/* =====================================================
   SYSTEM LOG
===================================================== */

function addLog(
  type,
  message
) {

  if (!systemLog) {
    return;
  }

  const row =
    document.createElement(
      "div"
    );

  const time =
    document.createElement(
      "span"
    );

  const text =
    document.createElement(
      "strong"
    );

  const now =
    new Date();

  time.textContent =
    now.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

  text.textContent =
    `[${type}] ${message}`;

  row.appendChild(
    time
  );

  row.appendChild(
    text
  );

  systemLog.prepend(
    row
  );

}


/* =====================================================
   AUTO LOGIN
===================================================== */

async function init() {

  if (!sessionToken) {

    loginScreen.style.display =
      "block";

    appScreen.style.display =
      "none";

    return;

  }

  loginScreen.style.display =
    "none";

  appScreen.style.display =
    "block";

  try {

    await loadDevices();

  } catch {

    await logout(false);

  }

}


/* =====================================================
   POLLING
===================================================== */

setInterval(
  async () => {

    if (
      sessionToken &&
      selectedDevice
    ) {

      await loadDeviceStatus();

    }

  },
  10000
);


/* =====================================================
   START
===================================================== */

init();