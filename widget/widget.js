const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

const replies = [
  "Got it! I'm working on that for you.",
  "Interesting — let me look into that.",
  "Sure thing! I'll handle it right away.",
  "On it. Give me just a moment.",
  "Great question. Here's what I know: this is a demo widget — wire me up to a real API to unlock full power!",
];

let replyIndex = 0;

function addMessage(text, role) {
  const msg = document.createElement("div");
  msg.classList.add("message", role);
  msg.textContent = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function handleSend() {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  userInput.value = "";

  setTimeout(() => {
    const reply = replies[replyIndex % replies.length];
    replyIndex++;
    addMessage(reply, "agent");
  }, 600);
}

sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});
