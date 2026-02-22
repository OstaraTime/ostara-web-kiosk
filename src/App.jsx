import { useState, useEffect } from "react";
import { createRoot } from 'react-dom/client';

const SCREENS = {
  WELCOME: "WELCOME",
  PIN: "PIN",
  ACTIONS: "ACTIONS",
  RESULT: "RESULT",
  ERROR: "ERROR",
  CONFIG_MISSING: "CONFIG_MISSING",
  CONFIG_EDITOR: "CONFIG_EDITOR",
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.WELCOME);
  const [pin, setPin] = useState("");
  const [userName, setUserName] = useState("");
  const [actions, setActions] = useState([]);
  const [result, setResult] = useState(null); // success | failure
  const [errorMessage, setErrorMessage] = useState("");
  const [weather, setWeather] = useState(null);

  // on-device config options
  const [API_URL, setApiUrl] = useState(null);
  const [CLIENT_ID, setClientId] = useState(null);
  const [SHARED_SECRET, setSharedSecret] = useState(null);

  useEffect(() => {
    // Check if URL has ?config=true to directly open config editor
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('config') === 'true') {
      setScreen(SCREENS.CONFIG_EDITOR);
    } else {
      loadConfig();
    }
    fetchWeather();
  }, []);


  const fetchWeather = async () => {
    try {
      const res = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=46.05&longitude=14.51&current_weather=true"
      );

      const data = await res.json();

      if (data.current_weather) {
        setWeather(data.current_weather);
      }
    } catch (err) {
      console.log("Weather unavailable (expected in kiosk/offline)", err);
    }
  };


  const loadConfig = () => {
    try {
      const storedApi = localStorage.getItem("API_URL");
      const storedClient = localStorage.getItem("CLIENT_ID");
      const storedSecret = localStorage.getItem("SHARED_SECRET");

      if (!storedApi || !storedClient || !storedSecret) {
        setScreen(SCREENS.CONFIG_MISSING);
        return;
      }

      setApiUrl(storedApi);
      setClientId(Number(storedClient));
      setSharedSecret(storedSecret);
    } catch (err) {
      console.error(err);
      setScreen(SCREENS.CONFIG_MISSING);
    }
  };

  // JWT stuff
  const buildJwt = async (payload) => {
    if (!SHARED_SECRET) throw new Error("Missing secret");

    const header = { alg: "HS512", typ: "JWT" };

    const enc = (obj) =>
      btoa(JSON.stringify(obj))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const encodedHeader = enc(header);
    const encodedPayload = enc(payload);
    const data = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SHARED_SECRET),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(data)
    );

    const encodedSig = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    return `${data}.${encodedSig}`;
  };

  const decodeJwtPayload = (jwt) => {
    try {
      const parts = jwt.split(".");
      if (parts.length !== 3) throw new Error("Invalid JWT format");
      const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(payload);
    } catch {
      throw new Error("Failed to decode JWT payload");
    }
  };

  const sendPin = async (enteredPin) => {
    if (!API_URL || !CLIENT_ID || !SHARED_SECRET) return;
    try {
      const jwtEvents = await buildJwt({
        iss: "Ostara",
        client: CLIENT_ID,
        action: "getEventTypes",
        token: Number(enteredPin),
      });
      const resEvents = await fetch(`${API_URL}?token=${jwtEvents}`);
      const textEvents = await resEvents.text();
      const decodedEvents = decodeJwtPayload(textEvents);
      if (!decodedEvents.eventTypeNames) throw new Error("Invalid response for event types");

      const jwtName = await buildJwt({
        iss: "Ostara",
        action: "getName",
        token: Number(enteredPin),
        client: CLIENT_ID,
      });
      const resName = await fetch(`${API_URL}?token=${jwtName}`);
      const textName = await resName.text();
      const decodedName = decodeJwtPayload(textName);
      if (!decodedName.name) throw new Error("Invalid response for user name");

      setUserName(decodedName.name);
      setActions(
        decodedEvents.eventTypeNames.map((name, idx) => ({ id: idx + 1, label: name.toUpperCase() }))
      );
      setScreen(SCREENS.ACTIONS);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message);
      setScreen(SCREENS.ERROR);
      setTimeout(() => resetApp(), 3000);
    }
  };

  const sendAction = async (action) => {
    if (!API_URL || !CLIENT_ID || !SHARED_SECRET) return;
    try {
      const jwt = await buildJwt({
        iss: "Ostara",
        action: "addEvent",
        token: Number(pin),
        client: CLIENT_ID,
        eventType: action.label.toLowerCase(),
      });
      const res = await fetch(`${API_URL}?token=${jwt}`);
      const text = await res.text();
      setResult(text.trim() === "OK" ? "success" : "failure");
      setScreen(SCREENS.RESULT);
      setTimeout(() => resetApp(), 2000);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message);
      setScreen(SCREENS.ERROR);
      setTimeout(() => resetApp(), 3000);
    }
  };

  const resetApp = () => {
    setPin("");
    setUserName("");
    setResult(null);
    setActions([]);
    setErrorMessage("");
    setScreen(SCREENS.WELCOME);
  };

  const handleDigit = (digit) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) sendPin(newPin);
  };

  if (screen === SCREENS.CONFIG_MISSING) {
    return (
      <div className="text-center text-3xl text-red-600 space-y-4">
        <div>Configuration missing! Please set API_URL, CLIENT_ID, and SHARED_SECRET.</div>
        <button
          onClick={() => setScreen(SCREENS.CONFIG_EDITOR)}
          className="px-6 py-2 rounded bg-blue-600 text-white mt-4"
        >
          Edit Config
        </button>
      </div>
    );
  }

  if (screen === SCREENS.CONFIG_EDITOR) {
    return <ConfigEditor onSave={loadConfig} />;
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-gray-100">
      {screen === SCREENS.WELCOME && (
        <Welcome
          onStart={() => setScreen(SCREENS.PIN)}
          weather={weather}
        />
      )}
      {screen === SCREENS.PIN && <PinScreen pin={pin} onDigit={handleDigit} />}
      {screen === SCREENS.ACTIONS && <ActionScreen userName={userName} actions={actions} onSelect={sendAction} />}
      {screen === SCREENS.RESULT && <ResultScreen result={result} />}
      {screen === SCREENS.ERROR && <ErrorScreen message={errorMessage} />}
    </div>
  );
}

function ConfigEditor({ onSave }) {
  const [apiUrl, setApiUrl] = useState(localStorage.getItem("API_URL") || "");
  const [clientId, setClientId] = useState(localStorage.getItem("CLIENT_ID") || "");
  const [secret, setSecret] = useState(localStorage.getItem("SHARED_SECRET") || "");

  const handleSave = () => {
    localStorage.setItem("API_URL", apiUrl);
    localStorage.setItem("CLIENT_ID", clientId);
    localStorage.setItem("SHARED_SECRET", secret);
    onSave();
  };

  return (
    <div className="text-center space-y-4">
      <h1 className="text-2xl font-bold">Edit Configuration</h1>
        <div className="space-y-2">
          <input className="border px-2 py-1 w-80" placeholder={`API URL`} value={""} onChange={e => setApiUrlState(e.target.value)} />
          <input className="border px-2 py-1 w-80" placeholder={`Client ID`} value={""} onChange={e => setClientIdState(e.target.value)} />
          <input className="border px-2 py-1 w-80" placeholder={`Shared Secret`} value={""} onChange={e => setSecretState(e.target.value)} />
        </div>
      <button onClick={handleSave} className="px-6 py-2 rounded bg-green-600 text-white mt-4">
        Save
      </button>
    </div>
  );
}

function Welcome({ onStart, weather }) {
  return (
    <div className="text-center space-y-6">
      <img src="/logo.png" alt="Logo" className="mx-auto h-24" />

      {weather && (
        <div className="text-gray-600 text-lg">
          🌡 {weather.temperature}°C  
          💨 {weather.windspeed} km/h
        </div>
      )}

      <button
        onClick={onStart}
        className="px-8 py-4 text-xl rounded-2xl bg-blue-600 text-white shadow"
      >
        PIN
      </button>
    </div>
  );
}


function PinScreen({ pin, onDigit }) {
  const digits = [1,2,3,4,5,6,7,8,9,0];
  return (
    <div className="space-y-4">
      <div className="text-center text-3xl tracking-widest">{"•".repeat(pin.length).padEnd(4, "○")}</div>
      <div className="grid grid-cols-3 gap-4">
        {digits.map((d) => (
          <button key={d} onClick={() => onDigit(String(d))} className="h-20 w-20 text-2xl rounded-full bg-white shadow">{d}</button>
        ))}
      </div>
    </div>
  );
}

function ActionScreen({ userName, actions, onSelect }) {
  return (
    <div className="text-center space-y-6 items-center flex flex-col">
      <h1 className="text-3xl">Hello, {userName}</h1>
      <div className="space-y-4">
        {actions.map((action) => (
          <button key={action.id} onClick={() => onSelect(action)} className="w-64 py-4 text-xl rounded-2xl bg-green-600 text-white flex flex-col items-center space-y-4">{action.label}</button>
        ))}
      </div>
    </div>
  );
}

function ResultScreen({ result }) {
  return <div className={`text-5xl font-bold ${result === "success" ? "text-green-600" : "text-red-600"}`}>{result === "success" ? "SUCCESS" : "FAILURE"}</div>;
}

function ErrorScreen({ message }) {
  return <div className="text-5xl font-bold text-red-600 text-center">ERROR: {message || "Something went wrong"}</div>;
}
