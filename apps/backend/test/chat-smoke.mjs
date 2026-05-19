import { io } from "socket.io-client";

const BACKEND = "http://localhost:3001";

const login = await fetch(`${BACKEND}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dr.benali@fedmri.local", password: "doctor1234" }),
});
const { accessToken } = await login.json();
console.log("Logged in, token len:", accessToken.length);

const socket = io(`${BACKEND}/chat`, {
  auth: { token: accessToken },
  transports: ["websocket"],
});

let received = "";
const startTime = Date.now();
let firstTokenAt = null;

await new Promise((resolve) => socket.on("connect", resolve));
console.log("WS connected, asking Ollama…");

socket.on("chat:token", (chunk) => {
  if (!firstTokenAt && chunk.token) firstTokenAt = Date.now() - startTime;
  if (chunk.done) {
    console.log("\n--- DONE ---");
    console.log(`First token: ${firstTokenAt}ms | Total: ${Date.now() - startTime}ms`);
    console.log(`Total chars: ${received.length}`);
    socket.disconnect();
    process.exit(0);
  }
  process.stdout.write(chunk.token);
  received += chunk.token;
});
socket.on("chat:error", (e) => { console.error("ERR", e); process.exit(1); });

socket.emit("chat:message", {
  content: "In ONE short sentence: what is the difference between Luminal A and Triple Negative breast cancer subtypes?",
  role: "doctor",
});

setTimeout(() => { console.error("Timeout"); process.exit(2); }, 90000);
