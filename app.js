/* =====================================================
   TACTIC
   FRONTEND APP
===================================================== */

const API_URL = "/.netlify/functions/tactic";
const AUTH_URL = "/.netlify/functions/auth";
const DEVICES_URL = "/.netlify/functions/my-devices";

/* =====================================================
   STORAGE
===================================================== */

let sessionToken = localStorage.getItem("tactic_session");
let currentUser = JSON.parse(
  localStorage.getItem("tactic_user") || "null"
);

let selectedDevice = localStorage.getItem("tactic_device");

let timerInterval = null;
let remainingSeconds = 0;


/* =====================================================
   DOM
===================================================== */

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const authTitle = document.getElementById("authTitle");
const switchAuth = document.getElementById("switchAuth");

const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");

const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");
const registerPasswordConfirm =
  document.getElementById("registerPasswordConfirm");

const loginMessage = document.getElementById("loginMessage");

const deviceSelect = document.getElementById("deviceSelect");
const refreshDevices = document.getElementById("refreshDevices");
const deviceListMessage = document.getElementById("deviceListMessage");

const logoutButton = document.getElementById("logoutButton");

const startFocus = document.getElementById("startFocus");

const timer = document.getElementById("timer");
const timerStatus = document.getElementById("timerStatus");

const deviceName = document.getElementById("deviceName");
const deviceState = document.getElementById("deviceState");

const deviceStatus = document.getElementById("deviceStatus");
const modeText = document.getElementById("modeText");
const sessionText = document.getElementById("sessionText");

const blockedCount = document.getElementById("blockedCount");

const instagramState = document.getElementById("instagramState");
const snapchatState = document.getElementById("snapchatState");
const youtubeState = document.getElementById("youtubeState");

const systemLog = document.getElementById("systemLog");


/* =====================================================
   AUTH MODE
===================================================== */

let registerMode = false;

switchAuth?.addEventListener("click", () => {

  registerMode = !registerMode;

  if (registerMode) {

    authTitle.textContent = "CREATE TACTIC ACCOUNT";

    loginForm.style.display = "none";
    registerForm.style.display = "block";

    switchAuth.textContent = "ALREADY HAVE AN ACCOUNT? LOGIN";

    loginMessage.textContent = "";

  } else {

    authTitle.textContent = "LOGIN TO TACTIC";

    loginForm.style.display = "block";
    registerForm.style.display = "none";

    switchAuth.textContent = "CREATE A NEW ACCOUNT";

    loginMessage.textContent = "";
  }

});


/* =====================================================
   API
===================================================== */

async function apiRequest(url, method = "GET", body = null) {

  const options = {
    method,
    headers: {}
  };

  if (sessionToken) {
    options.headers.Authorization = `Bearer ${sessionToken}`;
  }

  if (body) {

    options.headers["Content-Type"] = "application/json";

    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (response.status === 401) {

    await logout(false);

    throw new Error("SESSION_EXPIRED");
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

loginForm?.addEventListener("submit", async (event) => {

  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  loginMessage.textContent = "AUTHENTICATING...";

  try {

    const data = await fetch(AUTH_URL, {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        action: "login",
        email,
        password
      })

    });

    const result = await data.json();

    if (!data.ok || !result.success) {

      throw new Error(
        result.message ||
        result.error ||
        "LOGIN_FAILED"
      );
    }

    sessionToken = result.token;
    currentUser = result.user;

    localStorage.setItem(
      "tactic_session",
      sessionToken
    );

    localStorage.setItem(
      "tactic_user",
      JSON.stringify(currentUser)
    );

    loginMessage.textContent = "LOGIN SUCCESSFUL";

    showApp();

    await loadDevices();

  } catch (error) {

    loginMessage.textContent =
      error.message === "LOGIN_FAILED"
        ? "INVALID EMAIL OR PASSWORD"
        : error.message;

  }

});


/* =====================================================
   REGISTER
===================================================== */

registerForm?.addEventListener("submit", async (event) => {

  event.preventDefault();

  const email = registerEmail.value.trim();
  const password = registerPassword.value;
  const confirmPassword = registerPasswordConfirm.value;

  if (password !== confirmPassword) {

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

    const response = await fetch(AUTH_URL, {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        action: "register",

        email,

        password

      })

    });

    const result = await response.json();

    if (!response.ok || !result.success) {

      throw new Error(
        result.message ||
        result.error ||
        "REGISTRATION_FAILED"
      );
    }

    loginMessage.textContent =
      "ACCOUNT CREATED. YOU CAN LOGIN NOW.";

    /*
      Switch back to login
    */

    registerMode = false;

    authTitle.textContent =
      "LOGIN TO TACTIC";

    loginForm.style.display = "block";
    registerForm.style.display = "none";

    switchAuth.textContent =
      "CREATE A NEW ACCOUNT";

    emailInput.value = email;
    passwordInput.value = "";

    registerEmail.value = "";
    registerPassword.value = "";
    registerPasswordConfirm.value = "";

  } catch (error) {

    loginMessage.textContent =
      error.message || "REGISTRATION_FAILED";

  }

});


/* =====================================================
   SHOW APP
===================================================== */

function showApp() {

  loginScreen.style.display = "none";
  appScreen.style.display = "block";

}


/* =====================================================
   LOAD DEVICES
===================================================== */

async function loadDevices() {

  if (!sessionToken) return;

  deviceListMessage.textContent =
    "LOADING DEVICES...";

  try {

    const data = await apiRequest(
      DEVICES_URL,
      "GET"
    );

    const devices = data.devices || [];

    deviceSelect.innerHTML = "";

    if (!devices.length) {

      deviceListMessage.textContent =
        "NO TACTIC DEVICE LINKED TO THIS ACCOUNT.";

      selectedDevice = null;

      localStorage.removeItem("tactic_device");

      return;
    }

    deviceListMessage.textContent =
      `${devices.length} DEVICE(S) AVAILABLE`;

    devices.forEach(device => {

      const option =
        document.createElement("option");

      option.value = device.deviceId;

      option.textContent =
        `${device.deviceId} — ${device.status.toUpperCase()}`;

      deviceSelect.appendChild(option);

    });

    /*
      Restore previously selected device
    */

    const exists = devices.some(
      device =>
        device.deviceId === selectedDevice
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

  }

}


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

  if (!selectedDevice) return;

  try {

    const url =
      `${API_URL}?deviceId=${encodeURIComponent(selectedDevice)}`;

    const data = await apiRequest(
      url,
      "GET"
    );

    updateDeviceUI(data);

  } catch (error) {

    if (error.message !== "SESSION_EXPIRED") {

      addLog(
        "ERROR",
        error.message
      );

    }

  }

}


/* =====================================================
   UPDATE UI
===================================================== */

function updateDeviceUI(data) {

  const device =
    data.device || {};

  const session =
    data.session || {};

  const policy =
    data.policy || {};

  deviceName.textContent =
    device.deviceId ||
    selectedDevice ||
    "UNKNOWN";

  const status =
    device.status || "active";

  deviceState.textContent =
    status.toUpperCase();

  deviceStatus.textContent =
    status.toUpperCase();

  modeText.textContent =
    status === "focus"
      ? "FOCUS"
      : "STANDBY";

  if (session.active) {

    const expiresAt =
      new Date(session.expiresAt);

    const now =
      Date.now();

    remainingSeconds =
      Math.max(
        0,
        Math.floor(
          (expiresAt.getTime() - now) / 1000
        )
      );

    startTimer();

    sessionText.textContent =
      "ACTIVE";

    timerStatus.textContent =
      "FOCUS SESSION ACTIVE";

    startFocus.disabled = true;

  } else {

    stopTimer();

    sessionText.textContent =
      session.expired
        ? "EXPIRED"
        : "NONE";

    timerStatus.textContent =
      session.expired
        ? "SESSION COMPLETED"
        : "READY";

    startFocus.disabled = false;

  }

  updatePolicy(policy);

}


/* =====================================================
   POLICY
===================================================== */

function updatePolicy(policy) {

  const services = [
    {
      name: "instagram.com",
      element: instagramState
    },
    {
      name: "snapchat.com",
      element: snapchatState
    },
    {
      name: "youtube.com",
      element: youtubeState
    }
  ];

  let count = 0;

  services.forEach(service => {

    const blocked =
      policy[service.name] === true;

    if (blocked) count++;

    if (service.element) {

      service.element.textContent =
        blocked
          ? "BLOCKED"
          : "AVAILABLE";

    }

  });

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

    startFocus.disabled = true;

    timerStatus.textContent =
      "STARTING FOCUS...";

    try {

      const data = await apiRequest(
        API_URL,
        "POST",
        {
          action: "start",
          deviceId: selectedDevice
        }
      );

      addLog(
        "FOCUS",
        "FOCUS SESSION STARTED"
      );

      updateDeviceUI(data);

    } catch (error) {

      startFocus.disabled = false;

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

  if (!selectedDevice) return;

  try {

    const data = await apiRequest(
      API_URL,
      "POST",
      {
        action: "complete",
        deviceId: selectedDevice
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

  }

}


/* =====================================================
   TIMER
===================================================== */

function startTimer() {

  if (timerInterval) return;

  updateTimerDisplay();

  timerInterval =
    setInterval(async () => {

      remainingSeconds--;

      if (remainingSeconds <= 0) {

        remainingSeconds = 0;

        updateTimerDisplay();

        stopTimer();

        timerStatus.textContent =
          "COMPLETING SESSION...";

        await completeSession();

        return;
      }

      updateTimerDisplay();

    }, 1000);

}


function stopTimer() {

  if (timerInterval) {

    clearInterval(timerInterval);

    timerInterval = null;

  }

  remainingSeconds = 0;

  updateTimerDisplay();

}


function updateTimerDisplay() {

  const minutes =
    Math.floor(
      remainingSeconds / 60
    );

  const seconds =
    remainingSeconds % 60;

  timer.textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

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


async function logout(callBackend = true) {

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
            "Content-Type": "application/json",
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

  sessionToken = null;
  currentUser = null;
  selectedDevice = null;

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

  appScreen.style.display = "none";
  loginScreen.style.display = "block";

  loginForm.style.display = "block";
  registerForm.style.display = "none";

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

function addLog(type, message) {

  if (!systemLog) return;

  const row =
    document.createElement("div");

  const time =
    document.createElement("span");

  const text =
    document.createElement("strong");

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

  row.appendChild(time);
  row.appendChild(text);

  systemLog.prepend(row);

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