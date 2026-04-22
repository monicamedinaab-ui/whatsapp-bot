import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const candidates = new Map();

function getCandidate(phone) {
  if (!candidates.has(phone)) {
    candidates.set(phone, { step: 0, answers: {}, started: false });
  }
  return candidates.get(phone);
}

const QUESTIONS = [
  {
    key: "nome",
    text:
      "Oi! 👋 Tudo bem?\n\n" +
      "Eu sou a *Mari*, assistente virtual da *Maria Empregos* 🌟\n\n" +
      "Fico muito feliz que você veio até aqui! Vou te ajudar a encontrar uma oportunidade de trabalho rapidinho 💛\n\n" +
      "Mas antes de tudo... *qual é o seu nome?* 😊",
    freeText: true,
  },
  {
    key: "area",
    text: (nome) =>
      `Que nome lindo, ${nome}! 🌸\n\n` +
      `*Em qual dessas áreas você trabalha ou quer trabalhar?*\n\n` +
      `1️⃣ Atendimento ao cliente (garçom, caixa, vendas)\n` +
      `2️⃣ Cozinha ou preparo de alimentos\n` +
      `3️⃣ Depósito, almoxarifado ou logística\n` +
      `4️⃣ Reposição de mercadorias / supermercado\n` +
      `5️⃣ Limpeza ou manutenção\n` +
      `6️⃣ Qualquer vaga disponível — tô a fim de trabalhar!\n\n` +
      `_Manda o número da sua opção 😉_`,
    options: {
      "1": "Atendimento ao cliente",
      "2": "Cozinha ou preparo de alimentos",
      "3": "Depósito / logística",
      "4": "Reposição de mercadorias",
      "5": "Limpeza ou manutenção",
      "6": "Qualquer vaga disponível",
    },
  },
  {
    key: "status",
    text:
      "*Você tá trabalhando agora?*\n\n" +
      "1️⃣ Sim, com carteira assinada\n" +
      "2️⃣ Sim, mas é bico / informal\n" +
      "3️⃣ Não, tô procurando emprego\n" +
      "4️⃣ Tô trabalhando, mas quero mudar\n\n" +
      "_Manda o número 😊_",
    options: {
      "1": "Sim, com carteira assinada",
      "2": "Sim, bico / informal",
      "3": "Não, procurando emprego",
      "4": "Quer mudar de emprego",
    },
  },
  {
    key: "inicio",
    text:
      "*Se te chamarem, quando você consegue começar?*\n\n" +
      "1️⃣ Já! Pode chamar que eu apareço 💪\n" +
      "2️⃣ Em menos de uma semana\n" +
      "3️⃣ Em 2 semaninha ou mais\n" +
      "4️⃣ Depende do horário\n\n" +
      "_Manda o número 😉_",
    options: {
      "1": "Imediatamente",
      "2": "Menos de uma semana",
      "3": "2 semanas ou mais",
      "4": "Depende do horário",
    },
  },
  {
    key: "horarios",
    text:
      "*Quais horários você consegue trabalhar?*\n" +
      "_Pode escolher mais de um, é só mandar os números separados por vírgula_ 😊\n\n" +
      "1️⃣ Manhã\n" +
      "2️⃣ Tarde\n" +
      "3️⃣ Noite\n" +
      "4️⃣ Fim de semana\n" +
      "5️⃣ Escala rotativa\n" +
      "6️⃣ Só horário fixo\n\n" +
      "_Exemplo: 1,2 se puder manhã e tarde_",
    options: {
      "1": "Manhã",
      "2": "Tarde",
      "3": "Noite",
      "4": "Fim de semana",
      "5": "Escala rotativa",
      "6": "Só horário fixo",
    },
    multi: true,
  },
  {
    key: "experiencia",
    text:
      "*Você já trabalhou em alguma dessas funções?*\n" +
      "_Pode marcar mais de uma! 😄_\n\n" +
      "1️⃣ Garçom / garçonete\n" +
      "2️⃣ Auxiliar de cozinha\n" +
      "3️⃣ Lavador(a) de louças\n" +
      "4️⃣ Caixa de mercado ou loja\n" +
      "5️⃣ Repositor(a) de mercadorias\n" +
      "6️⃣ Empacotador(a) de supermercado\n" +
      "7️⃣ Atendimento ao cliente\n" +
      "8️⃣ Serviços gerais / limpeza\n" +
      "9️⃣ Ainda não trabalhei, mas tô disposto(a)!\n\n" +
      "_Exemplo: 1,4 se foi garçom e caixa_",
    options: {
      "1": "Garçom / garçonete",
      "2": "Auxiliar de cozinha",
      "3": "Lavador(a) de louças",
      "4": "Caixa",
      "5": "Repositor(a)",
      "6": "Empacotador(a)",
      "7": "Atendimento ao cliente",
      "8": "Serviços gerais / limpeza",
      "9": "Sem experiência, mas disposto(a)",
    },
    multi: true,
  },
  {
    key: "objetivo",
    text:
      "*O que você tá buscando hoje?* 🎯\n\n" +
      "1️⃣ Tô procurando trabalho ativamente\n" +
      "2️⃣ Quero montar meu currículo por aqui\n\n" +
      "_Manda o número 😊_",
    options: {
      "1": "Procura trabalho ativamente",
      "2": "Quer criar currículo",
    },
  },
  {
    key: "salario",
    text:
      "Última perguntinha, prometo! 🙏\n\n" +
      "💰 *Quanto você ganha hoje ou quanto você espera ganhar?*\n\n" +
      "_Pode falar à vontade, sem cerimônia! Ex: uns R$ 1.500, não tenho valor fixo, etc._",
    freeText: true,
  },
];

function parseMultiOption(input, options) {
  const parts = input.split(/[,\s]+/).map((s) => s.trim());
  const results = [];
  for (const part of parts) {
    if (options[part]) results.push(options[part]);
  }
  return results.length ? results : null;
}

async function generateClosingMessage(answers) {
  const prompt = `
Você é a Mari, assistente virtual da Maria Empregos. Fala português brasileiro bem popular e acolhedor, estilo nordestino, como Ivete Sangalo — calorosa, animada, próxima da pessoa, sem ser grossa.

Um candidato completou o formulário com esses dados:
- Nome: ${answers.nome}
- Área de interesse: ${answers.area}
- Situação profissional: ${answers.status}
- Disponibilidade: ${answers.inicio}
- Horários: ${answers.horarios}
- Experiência: ${answers.experiencia}
- Objetivo: ${answers.objetivo}
- Salário esperado: ${answers.salario}

Gere uma mensagem de encerramento curta (máximo 6 linhas) que:
1. Chame pelo nome da pessoa com carinho
2. Comemore que ela terminou o formulário, com energia e alegria
3. Confirme que os dados foram registrados
4. Diga que a equipe da Maria Empregos vai entrar em contato quando surgir uma vaga
5. Termine com uma frase super acolhedora e animada, como se fosse um abraço
O tom deve ser como Ivete Sangalo falando: popular, nordestino, cheio de energia e carinho, sem ser formal. Use expressões como "arrasou", "que orgulho", "mandou bem", "vai dar certo". Use emojis com alegria. Use *texto* para negrito (formato WhatsApp). Sem markdown com #. Sem asteriscos duplos.
`.trim();

  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function saveToSheets(phone, answers) {
  try {
    await fetch(process.env.GOOGLE_SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telefone: phone,
        nome: answers.nome || "",
        area: answers.area || "",
        status: answers.status || "",
        inicio: answers.inicio || "",
        horarios: answers.horarios || "",
        experiencia: answers.experiencia || "",
        objetivo: answers.objetivo || "",
        salario: answers.salario || "",
      }),
    });
    console.log("✅ Guardado en Google Sheets");
  } catch (err) {
    console.error("❌ Error Google Sheets:", err.message);
  }
}

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
    throw new Error("Falha ao enviar mensagem");
  }
}

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
        "⚠️ Não entendi, não! Manda os números separados por vírgula.\n_Exemplo: 1,3_ 😊"
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
        `⚠️ Manda só o número da opção, tá? (${validKeys}) 😊`
      );
    }
    candidate.answers[currentQ.key] = selected;
    candidate.step++;
  }

  if (candidate.step < QUESTIONS.length) {
    const nextQ = QUESTIONS[candidate.step];
    const text =
      typeof nextQ.text === "function"
        ? nextQ.text(candidate.answers.nome)
        : nextQ.text;
    return await sendWhatsAppMessage(phone, text);
  }

  // Formulário completo
  console.log(`\n✅ Candidato finalizado [${phone}]:`, candidate.answers);
  await saveToSheets(phone, candidate.answers);
  const closing = await generateClosingMessage(candidate.answers);
  await sendWhatsAppMessage(phone, closing);
  candidates.delete(phone);
}

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

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const phone = message.from;
    const text = message.text.body;
    console.log(`📨 [${phone}] → "${text}"`);

    const candidate = getCandidate(phone);

    if (!candidate.started) {
      candidate.started = true;
      await sendWhatsAppMessage(phone, QUESTIONS[0].text);
      return;
    }

    await handleMessage(phone, text);
  } catch (err) {
    console.error("❌ Erro:", err.message);
  }
});

app.get("/", (_req, res) => res.send("Mari rodando ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Mari rodando na porta ${PORT}`));
