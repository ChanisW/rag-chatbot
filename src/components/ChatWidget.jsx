import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ChatWidget = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const chatBodyRef = useRef(null);

  const appendMessage = (role, text) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const updateLastAssistantMessage = (text) => {
    setMessages((prev) => {
      const updated = [...prev];
      const lastIndex = updated.length - 1;
      if (lastIndex >= 0 && updated[lastIndex].role === "assist") {
        updated[lastIndex].text = text;
      }
      return updated;
    });
  };

  const scrollToBottom = () => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  };

  const firstLoad = useRef(true);

  useEffect(() => {
    if (messages.length === 0 && firstLoad.current) {
      appendMessage(
        "assist",
        `👋 สวัสดี! ยินดีต้อนรับสู่ AE Chat Assistant!  
  ฉันสามารถช่วยคุณตอบคำถาม แนะนำ หรือให้ข้อมูลที่เป็นประโยชน์ได้ ✨  
  ลองพิมพ์คำถามของคุณด้านล่างเลย...`
      );
      firstLoad.current = false; // mark that we already showed welcome
    }
  }, [messages]);
  
  

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userInput = input.trim();

    const queryWithInstruction = `
Please answer in a well-structured, easy-to-read style using:
- clear topic headers (with bold or emojis)
- bullet points or numbered lists
- markdown tables if useful
- friendly tone with light emojis

User question: ${userInput}
    `.trim();

    appendMessage("user", userInput);
    setInput("");
    appendMessage("assist", "...");

    try {
      await callRagStreaming(queryWithInstruction);
    } catch (err) {
      updateLastAssistantMessage("❌ " + err.message);
    }
  };

  const callRagStreaming = async (query) => {
    const XF_SERVICE_ID = "API_20250930xv501";
    const XF_API_KEY = "fbc957de044d9fb1a8473079973a94e6";
    const XF_API_SECRET = "MWU1NzU1NDY3N2ZkNDYyZGJmZjI4NWE3";

    const rawUrl = `https://knowledge-retrieval.cn-huabei-1.xf-yun.com/v2/knowledge/augmented/spark-chat/${XF_SERVICE_ID}`;

    const buildSignedUrl = async () => {
      const url = new URL(rawUrl);
      const host = url.host;
      const path = url.pathname;
      const date = new Date().toUTCString().replace("GMT", "UTC");

      const canonical = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(XF_API_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(canonical));
      const base64signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
      const authPlain = `api_key="${XF_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${base64signature}"`;
      const auth = btoa(authPlain);

      url.searchParams.set("authorization", auth);
      url.searchParams.set("host", host);
      url.searchParams.set("date", date);
      return url.toString();
    };

    const signedUrl = await buildSignedUrl();
    const wsUrl = "wss://" + signedUrl.split("://")[1];
    const payload = {
      "service.id": XF_SERVICE_ID,
      query,
    };

    console.log("[RAG] Connecting to:", wsUrl);
    let answer = "";

    return new Promise((resolve, reject) => {
      let ws;
      let timeout;

      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        return reject(new Error("WebSocket failed to initialize: " + e.message));
      }

      const resetTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          ws.close();
          reject(new Error("⏰ Timeout: No response from API"));
        }, 60000);
      };

      ws.onopen = () => {
        console.log("[RAG] WS Open ✅");
        ws.send(JSON.stringify(payload));
        resetTimeout();
      };

      ws.onmessage = (event) => {
        resetTimeout();
        try {
          const data = JSON.parse(event.data);
          const chunk = data?.data?.response?.content || "";
          if (chunk) {
            answer += chunk;
            updateLastAssistantMessage(answer);
          }

          if (data?.message?.status === 2 || data?.message?.status === 3) {
            clearTimeout(timeout);
            ws.close();
            resolve(answer);
          }
        } catch (err) {
          ws.close();
          reject(new Error("Error parsing response"));
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket error"));
      };

      ws.onclose = (e) => {
        console.warn(`[RAG] WS Closed: ${e.code} ${e.reason || ""}`);
      };
    });
  };

  const markdownComponents = {
    table: ({ node, ...props }) => (
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            marginTop: "8px",
            marginBottom: "8px",
            border: "1px solid #ddd",
            borderRadius: "8px",
          }}
          {...props}
        />
      </div>
    ),
    th: ({ node, ...props }) => (
      <th
        style={{
          border: "1px solid #ddd",
          padding: "10px",
          backgroundColor: "#d7232d",
          color: "white",
          textAlign: "left",
        }}
        {...props}
      />
    ),
    td: ({ node, ...props }) => (
      <td
        style={{
          border: "1px solid #ddd",
          padding: "8px",
          textAlign: "left",
        }}
        {...props}
      />
    ),
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>AE Chat Assistant</header>

      <div style={styles.chatBody} ref={chatBodyRef}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              ...styles.message,
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              backgroundColor: msg.role === "user" ? "#d7232d" : "#ffffff",
              color: msg.role === "user" ? "#fff" : "#333",
            }}
          >
            {msg.role === "assist" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {msg.text}
              </ReactMarkdown>
            ) : (
              msg.text
            )}
          </div>
        ))}
      </div>

      <div style={styles.inputArea}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type your message..."
        />
        <button onClick={sendMessage} style={styles.button}>
          ➤
        </button>
      </div>

      <button
  onClick={() => {
    setMessages([]);
    firstLoad.current = true;
  }}
  style={{
    backgroundColor: '#f0f0f0',
    color: '#333',
    padding: '6px 12px',
    borderRadius: '8px',
    margin: '6px auto',
    border: 'none',
    cursor: 'pointer',
  }}
>
  🧹 Clear Chat
</button>

    </div>
  );
};

const styles = {
  container: {
    maxWidth: "600px",
    margin: "40px auto",
    display: "flex",
    flexDirection: "column",
    height: "85vh",
    border: "1px solid #ccc",
    borderRadius: "20px",
    overflow: "hidden",
    background: "linear-gradient(to bottom right, #fff, #ffe6e6)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
    fontFamily: "'Poppins', sans-serif",
  },
  header: {
    backgroundColor: "#d7232d",
    color: "white",
    textAlign: "center",
    padding: "12px 0",
    fontWeight: "600",
    fontSize: "1.1rem",
  },
  chatBody: {
    flex: 1,
    padding: "16px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  inputArea: {
    display: "flex",
    padding: "10px",
    backgroundColor: "#fff",
    borderTop: "1px solid #eee",
  },
  input: {
    flex: 1,
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #ddd",
    fontSize: "15px",
    outline: "none",
    marginRight: "10px",
  },
  button: {
    backgroundColor: "#d7232d",
    color: "white",
    border: "none",
    padding: "12px 18px",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "0.2s",
  },
  clearBtn: {
    backgroundColor: "#f5f5f5",
    color: "#555",
    border: "none",
    margin: "8px auto",
    padding: "6px 14px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    transition: "0.2s",
  },
  message: {
    padding: "10px 14px",
    margin: "6px 0",
    borderRadius: "16px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    maxWidth: "80%",
    wordBreak: "break-word",
    lineHeight: "1.5",
    transition: "all 0.3s ease",
  },
};

export default ChatWidget;
