import "server-only";

/**
 * Architecture des notifications externes (SMS, WhatsApp, e-mail).
 *
 * 1. Les notifications internes sont créées en base par les fonctions SQL
 *    (table `notifications`) : elles fonctionnent dès maintenant.
 * 2. Pour un envoi externe, une ligne est ajoutée dans `notification_outbox`
 *    (canal + statut « pending »). Un worker (route planifiée ou Edge Function)
 *    lit la file, appelle le prestataire via l'interface ci-dessous et met à jour
 *    le statut (« sent » / « failed »).
 * 3. Aucun prestataire n'est configuré : rien n'est envoyé ni simulé.
 *
 * Pour brancher un prestataire (ex. Orange SMS API, Twilio, Meta WhatsApp Cloud API,
 * Resend…), implémenter `NotificationProvider` et l'enregistrer dans `getProvider`
 * en lisant ses identifiants depuis des variables d'environnement serveur.
 */
export type Channel = "sms" | "whatsapp" | "email";

export type OutgoingMessage = { channel: Channel; to: string; title: string; body: string };

export interface NotificationProvider {
  readonly channel: Channel;
  readonly configured: boolean;
  send(message: OutgoingMessage): Promise<{ ok: true; providerId: string } | { ok: false; error: string }>;
}

class NotConfiguredProvider implements NotificationProvider {
  readonly configured = false;
  constructor(readonly channel: Channel) {}
  async send(): Promise<{ ok: false; error: string }> {
    return { ok: false, error: `Aucun prestataire ${this.channel} configuré` };
  }
}

export function getProvider(channel: Channel): NotificationProvider {
  // Exemple d'intégration future :
  // if (channel === "sms" && process.env.SMS_API_KEY) return new OrangeSmsProvider(process.env.SMS_API_KEY);
  return new NotConfiguredProvider(channel);
}
