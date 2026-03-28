const PUSHOVER_API = "https://api.pushover.net/1/messages.json";

interface PushoverMessage {
  title: string;
  message: string;
  priority?: -2 | -1 | 0 | 1;
}

export async function sendPushoverNotification(msg: PushoverMessage): Promise<void> {
  const userKey = process.env.PUSHOVER_USER_KEY;
  const apiToken = process.env.PUSHOVER_API_TOKEN;

  if (!userKey || !apiToken) return;

  try {
    const res = await fetch(PUSHOVER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: apiToken,
        user: userKey,
        title: msg.title,
        message: msg.message,
        priority: msg.priority ?? 0,
      }),
    });

    if (!res.ok) {
      console.error("Pushover notification failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Pushover notification error:", err);
  }
}
