import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  console.warn("[Groq] GROQ_API_KEY not set — AI chat will fail");
}

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

export const AI_MODEL = "llama-3.3-70b-versatile";
