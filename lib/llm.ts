export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/Llama-4-Scout-17B-16E-Instruct";

function log(...args: unknown[]) {
  console.log(`[AI ${new Date().toISOString()}]`, ...args);
}

/** Calls a Llama model through Hugging Face's OpenAI-compatible Inference
 * Providers router (cloud-hosted - no local GPU/Python needed). Model is
 * configurable via HF_MODEL so it can be swapped without code changes.
 * Logs each call to the terminal (model, duration, outcome) so AI activity
 * is visible while `npm run dev` is running. */
export async function callLLM(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const token = process.env.HF_TOKEN;
  if (!token) {
    const err = "HF_TOKEN belum diset. Tambahkan di .env.local untuk mengaktifkan analisis AI.";
    log(err);
    throw new Error(err);
  }
  const model = process.env.HF_MODEL || DEFAULT_MODEL;
  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const startedAt = Date.now();
  log(`-> memanggil "${model}" (${messages.length} pesan, ~${promptChars} karakter prompt)...`);

  let res: Response;
  try {
    res = await fetch(HF_ROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 900,
      }),
    });
  } catch (err) {
    log(`<- gagal terhubung setelah ${Date.now() - startedAt}ms:`, err instanceof Error ? err.message : err);
    throw err;
  }

  const durationMs = Date.now() - startedAt;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log(`<- error ${res.status} setelah ${durationMs}ms:`, text.slice(0, 300));
    throw new Error(`Hugging Face Inference API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    log(`<- respons tidak sesuai format setelah ${durationMs}ms:`, JSON.stringify(data).slice(0, 300));
    throw new Error("Respons LLM tidak sesuai format yang diharapkan.");
  }

  const usage = data?.usage;
  log(
    `<- selesai dalam ${durationMs}ms, ${content.length} karakter dihasilkan` +
      (usage ? ` (token: ${usage.prompt_tokens ?? "?"} in / ${usage.completion_tokens ?? "?"} out)` : "")
  );
  return content;
}
