import { Notifier, NotifierError } from "./types";
import { emailResend } from "./email-resend";

function stub(id: string, name: string): Notifier {
  return {
    id,
    name,
    async send() {
      throw new NotifierError(`${name} notifier not implemented`, "not_implemented");
    },
  };
}

export const notifiers: Record<string, Notifier> = {
  [emailResend.id]: emailResend,
  webhook: stub("webhook", "Webhook"),
  sms: stub("sms", "SMS"),
  slack: stub("slack", "Slack"),
  telegram: stub("telegram", "Telegram"),
};

export function getNotifier(id: string): Notifier | undefined {
  return notifiers[id.toLowerCase()];
}
