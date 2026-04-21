import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ── Gemini client ───────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ── In-memory store ─────────────────────────────────────────────────────────
const candidates = new Map();

function getCandidate(phone) {
  if (!candidates.has(phone)) {
    candidates.set(phone, { step: 0, answers: {} });
  }
  return candidates.get(phone);
}

// ── Cuestionario ────────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    key: "area",
    text:
      "👋 ¡Hola! Soy el asistente de *Empleos Rápidos*.\n\n" +
      "Voy a hacerte unas preguntas cortas para conectarte con empleadores 🚀\n\n" +
      "*¿En cuál de estas áreas te interesa trabajar?*\n\n" +
      "1️⃣ Atención al cliente (mesero, cajero, ventas)\n" +
      "2️⃣ Cocina o preparación de alimentos\n" +
      "3️⃣ Bodega, almacén o logística\n" +
      "4️⃣ Reposición de mercadería / supermercado\n" +
      "5️⃣ Limpieza o mantenimiento\n" +
      "6️⃣ Cualquier trabajo disponible\n\n" +
      "_Respondé con el número de tu opción_",
    options: {
      "1": "Atención al cliente",
      "2": "Cocina o preparación de alimentos",
      "3": "Bodega / logística",
      "4": "Reposición de mercadería",
      "5": "Limpieza o mantenimiento",
      "6": "Cualquier trabajo disponible",
    },
  },
  {
    key: "status",
    text:
      "*¿Actualmente estás trabajando?*\n\n" +
      "1️⃣ Sí, con contrato\n" +
      "2️⃣ Sí, de manera informal\n" +
      "3️⃣ No estoy trabajando\n" +
      "4️⃣ Estoy trabajando pero busco cambiar\n\n" +
      "_Respondé con el número de tu opción_",
    options: {
      "1": "Sí, con contrato",
      "2": "Sí, informal",
      "3": "No estoy trabajando",
      "4": "Busco cambiar",
    },
  },
  {
    key: "start",
    text:
      "*¿Cuándo podrías empezar si te llaman?*\n\n" +
      "1️⃣ Inmediatamente\n" +
      "2️⃣ En menos de una semana\n" +
      "3️⃣ En 2 semanas o más\n" +
      "4️⃣ Depende del horario\n\n" +
      "_Respondé con el número de tu opción_",
    options: {
      "1": "Inmediatamente",
      "2": "Menos de una semana",
      "3": "2 semanas o más",
      "4": "Depende del horario",
    },
  },
  {
    key: "schedule",
    text:
      "*¿Qué horarios podés trabajar?* (podés elegir varios, separados por coma)\n\n" +
      "1️⃣ Turno mañana\n" +
      "2️⃣ Turno tarde\n" +
      "3️⃣ Turno noche\n" +
      "4️⃣ Fines de semana\n" +
      "5️⃣ Turnos rotativos\n" +
      "6️⃣ Solo horario fijo\n\n" +
      "_Ejemplo: 1,2 si podés mañana y tarde_",
    options: {
      "1": "Turno mañana",
      "2": "Turno tarde",
      "3": "Turno noche",
      "4": "Fines de semana",
      "5": "Turnos rotativos",
      "6": "Solo horario fijo",
    },
    multi: true,
  },
  {
    key: "experience",
    text:
      "*¿Trabajaste antes en alguno de estos puestos?* (podés elegir varios)\n\n" +
      "1️⃣ Mesero / garzón\n" +
      "2️⃣ Auxiliar de cocina\n" +
      "3️⃣ Lavaplatos\n" +
      "4️⃣ Cajero de supermercado o tienda\n" +
      "5️⃣ Repositor / reponedor\n" +
      "6️⃣ Empacador de supermercado\n" +
      "7️⃣ Atención al cliente en tienda\n" +
      "8️⃣ No he trabajado en estos puestos\n\n" +
      "_Ejemplo: 1,4 si fuiste mesero y cajero_",
    options: {
      "1": "Mesero / garzón",
      "2": "Auxiliar de cocina",
      "3": "Lavaplatos",
      "4": "Cajero",
      "5": "Repositor",
      "6": "Empacador",
      "7": "Atención al cliente",
      "8": "Sin experiencia previa",
    },
    multi: true,
  },
  {
    key: "goal",
    text:
      "*¿Qué estás buscando hacer hoy?*\n\n" +
      "1️⃣ Busco trabajo activamente\n" +
      "2️⃣ Quiero crear mi CV aquí\n\n" +
      "_Respondé con el número de tu opción_",
    options: {
      "1": "Busca trabajo activamente",
      "2": "Quiere crear su CV",
    },
  },
  {
    key: "salary",
    text:
      "💰 *¿Cuánto estás ganando actualmente o cuánto esperás ganar?*\n\n" +
      "_Escribí libremente, por ejemplo: 350.000 al mes o no tengo sueldo fijo_",
    freeText: true,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseMultiOption(input, options) {
  const parts = input.split(/[,\s]+/).map((s) => s.trim());
  const results = [];
  for (const part of parts) {
    if (options[part]) results.push(options[part]);
  }
  return results.length ? results : null;
}

// ── Gemini genera el mensaje de cierre ───────────────────────────────────────
async function generateClosingMessage(answers) {
  const prompt = `
Sos un asistente de reclutamiento amable y directo.
Un candidato completó un formulario de WhatsApp con estos datos:
- Área de interés: ${answers.area}
- Estado laboral: ${answers.status}
- Disponibilidad: ${answers.start}
- Horarios: ${answers.schedule}
- Experiencia: ${answers.experience}
- Objetivo: ${answers.goal}
- Salario esperado: ${answers.salary}

Generá un mensaje de cierre breve (máximo 5 líneas) que:
1. Agradezca por completar el formulario
2. Confirme que sus datos fueron registrados
3. Indique que un reclutador lo contactará si hay una oportunidad que coincida
4. Sea cálido pero sin exagerar
Usá emojis con moderación. Usá *texto* para negritas (formato WhatsApp). Sin markdown con #.
`.trim();

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ── Enviar mensaje vía WhatsApp Cloud API ────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    console.error("❌ Error WhatsApp:", JSON.stringify(err));
    throw new Error("Fallo al enviar mensaje");
  }
}

// ── Lógica principal ─────────────────────────────────────────────────────────
async function handleMessage(phone, incomingText) {
  const candidate = getCandidate(phone);
  const text = incomingText.trim();
  const currentQ = QUESTIONS[candidate.step];

  if (currentQ.freeText) {
    candidate.answers[currentQ.key] = text;
    candidate.step++;
  } else if (currentQ.multi) {
    const selected = parseMultiOption(text, currentQ.options);
    if (!selected) {
      return await sendWhatsAppMessage(
        phone,
        "⚠️ No entendí tu respuesta. Escribí los números separados por coma.\n_Ejemplo: 1,3_"
      );
    }
    candidate.answers[currentQ.key] = selected.join(", ");
    candidate.step++;
  } else {
    const selected = currentQ.options[text];
    if (!selected) {
      const validKeys = Object.keys(currentQ.options).join(", ");
      return await sendWhatsAppMessage(
        phone,
        `⚠️ Por favor respondé con un número (${validKeys})`
      );
    }
    candidate.answers[currentQ.key] = selected;
    candidate.step++;
  }

  if (candidate.step < QUESTIONS.length) {
    return await sendWhatsAppMessage(phone, QUESTIONS[candidate.step].text);
  }

  // Formulario completo
  console.log(`\n✅ Candidato completado [${phone}]:`, candidate.answers);
  const closing = await generateClosingMessage(candidate.answers);
  await sendWhatsAppMessage(phone, closing);
  candidates.delete(phone);
}

// ── Webhook verificación ─────────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Webhook mensajes entrantes ───────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const phone = message.from;
    const text = message.text.body;

    console.log(`📨 [${phone}] → "${text}"`);

    const candidate = getCandidate(phone);

    if (candidate.step === 0 && !candidate.answers.area) {
      await sendWhatsAppMessage(phone, QUESTIONS[0].text);
      return;
    }

    await handleMessage(phone, text);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
});

app.get("/", (_req, res) => res.send("Bot corriendo ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot corriendo en puerto ${PORT}`));
