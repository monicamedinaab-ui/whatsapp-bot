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

// ── Cuestionario em português brasileiro ────────────────────────────────────
const QUESTIONS = [
  {
    key: "area",
    text:
      "👋 Olá! Sou o assistente de *Empregos Rápidos*.\n\n" +
      "Vou te fazer algumas perguntas rápidas para te conectar com empregadores 🚀\n\n" +
      "*Em qual dessas áreas você trabalha ou tem interesse?*\n\n" +
      "1️⃣ Atendimento ao cliente (garçom, caixa, vendas)\n" +
      "2️⃣ Cozinha ou preparo de alimentos\n" +
      "3️⃣ Depósito, armazém ou logística\n" +
      "4️⃣ Reposição de mercadorias / supermercado\n" +
      "5️⃣ Limpeza ou manutenção\n" +
      "6️⃣ Qualquer trabalho disponível\n\n" +
      "_Responda com o número da sua opção_",
    options: {
      "1": "Atendimento ao cliente",
      "2": "Cozinha ou preparo de alimentos",
      "3": "Depósito / logística",
      "4": "Reposição de mercadorias",
      "5": "Limpeza ou manutenção",
      "6": "Qualquer trabalho disponível",
    },
  },
  {
    key: "status",
    text:
      "*Você está trabalhando atualmente?*\n\n" +
      "1️⃣ Sim, com carteira assinada\n" +
      "2️⃣ Sim, de forma informal\n" +
      "3️⃣ Não estou trabalhando\n" +
      "4️⃣ Estou trabalhando mas quero mudar\n\n" +
      "_Responda com o número da sua opção_",
    options: {
      "1": "Sim, com carteira assinada",
      "2": "Sim, informal",
      "3": "Não estou trabalhando",
      "4": "Quer mudar de emprego",
    },
  },
  {
    key: "start",
    text:
      "*Quando você poderia começar a trabalhar se te chamarem?*\n\n" +
      "1️⃣ Imediatamente\n" +
      "2️⃣ Em menos de uma semana\n" +
      "3️⃣ Em 2 semanas ou mais\n" +
      "4️⃣ Depende do horário\n\n" +
      "_Responda com o número da sua opção_",
    options: {
      "1": "Imediatamente",
      "2": "Menos de uma semana",
      "3": "2 semanas ou mais",
      "4": "Depende do horário",
    },
  },
  {
    key: "schedule",
    text:
      "*Quais horários você pode trabalhar?* (pode escolher vários, separados por vírgula)\n\n" +
      "1️⃣ Turno manhã\n" +
      "2️⃣ Turno tarde\n" +
      "3️⃣ Turno noite\n" +
      "4️⃣ Fins de semana\n" +
      "5️⃣ Turnos rotativos\n" +
      "6️⃣ Somente horário fixo\n\n" +
      "_Exemplo: 1,2 se puder manhã e tarde_",
    options: {
      "1": "Turno manhã",
      "2": "Turno tarde",
      "3": "Turno noite",
      "4": "Fins de semana",
      "5": "Turnos rotativos",
      "6": "Somente horário fixo",
    },
    multi: true,
  },
  {
    key: "experience",
    text:
      "*Você já trabalhou em alguma dessas funções?* (pode escolher várias)\n\n" +
      "1️⃣ Garçom / garçonete\n" +
      "2️⃣ Auxiliar de cozinha\n" +
      "3️⃣ Lavador de louças\n" +
      "4️⃣ Caixa de supermercado ou loja\n" +
      "5️⃣ Repositor de mercadorias\n" +
      "6️⃣ Empacotador de supermercado\n" +
      "7️⃣ Atendimento ao cliente em loja\n" +
      "8️⃣ Não trabalhei nessas funções\n\n" +
      "_Exemplo: 1,4 se foi garçom e caixa_",
    options: {
      "1": "Garçom / garçonete",
      "2": "Auxiliar de cozinha",
      "3": "Lavador de louças",
      "4": "Caixa",
      "5": "Repositor",
      "6": "Empacotador",
      "7": "Atendimento ao cliente",
      "8": "Sem experiência prévia",
    },
    multi: true,
  },
  {
    key: "goal",
    text:
      "*O que você está buscando hoje?*\n\n" +
      "1️⃣ Estou procurando trabalho ativamente\n" +
      "2️⃣ Quero criar meu currículo aqui\n\n" +
      "_Responda com o número da sua opção_",
    options: {
      "1": "Procura trabalho ativamente",
      "2": "Quer criar currículo",
    },
  },
  {
    key: "salary",
    text:
      "💰 *Quanto você ganha atualmente ou quanto espera ganhar?*\n\n" +
      "_Escreva livremente, por exemplo: R$ 1.500 por mês ou não tenho salário fixo_",
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

// ── Gemini gera a mensagem de encerramento ───────────────────────────────────
async function generateClosingMessage(answers) {
  const prompt = `
Você é um assistente de recrutamento simpático e direto, que fala português brasileiro informal.
Um candidato completou um formulário pelo WhatsApp com esses dados:
- Área de interesse: ${answers.area}
- Situação profissional: ${answers.status}
- Disponibilidade: ${answers.start}
- Horários: ${answers.schedule}
- Experiência: ${answers.experience}
- Objetivo: ${answers.goal}
- Salário esperado: ${answers.salary}

Gere uma mensagem de encerramento curta (máximo 5 linhas) que:
1. Agradeça por ter respondido o formulário
2. Confirme que os dados foram registrados
3. Informe que um recrutador vai entrar em contato se surgir uma oportunidade compatível
4. Seja calorosa mas sem exagerar
Use emojis com moderação. Use *texto* para negrito (formato WhatsApp). Sem markdown com #.
`.trim();

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ── Enviar mensagem via WhatsApp Cloud API ────────────────────────────────────
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
    console.error("❌ Erro WhatsApp:", JSON.stringify(err));
    throw new Error("Falha ao enviar mensagem");
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
        "⚠️ Não entendi sua resposta. Escreva os números separados por vírgula.\n_Exemplo: 1,3_"
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
        `⚠️ Por favor responda com um número (${validKeys})`
      );
    }
    candidate.answers[currentQ.key] = selected;
    candidate.step++;
  }

  if (candidate.step < QUESTIONS.length) {
    return await sendWhatsAppMessage(phone, QUESTIONS[candidate.step].text);
  }

  // Formulário completo
  console.log(`\n✅ Candidato finalizado [${phone}]:`, candidate.answers);
  const closing = await generateClosingMessage(candidate.answers);
  await sendWhatsAppMessage(phone, closing);
  candidates.delete(phone);
}

// ── Webhook verificação ─────────────────────────────────────────────────────
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

// ── Webhook mensagens recebidas ──────────────────────────────────────────────
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
    console.error("❌ Erro:", err.message);
  }
});

app.get("/", (_req, res) => res.send("Bot rodando ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot rodando na porta ${PORT}`));
