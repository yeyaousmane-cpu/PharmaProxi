export type OrderStatus =
  | "pending_confirmation" | "confirmed" | "preparing" | "ready_for_pickup" | "awaiting_courier"
  | "courier_assigned" | "in_delivery" | "delivered" | "completed" | "cancelled" | "rejected" | "expired" | "delivery_failed";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_confirmation: "En attente de confirmation",
  confirmed: "Confirmée par la pharmacie",
  preparing: "En préparation",
  ready_for_pickup: "Prête au retrait",
  awaiting_courier: "En attente d'affectation d'un livreur",
  courier_assigned: "Livreur affecté",
  in_delivery: "En cours de livraison",
  delivered: "Livrée",
  completed: "Retirée en pharmacie",
  cancelled: "Annulée",
  rejected: "Refusée par la pharmacie",
  expired: "Expirée",
  delivery_failed: "Échec de livraison",
};

export const TERMINAL: OrderStatus[] = ["delivered", "completed", "cancelled", "rejected", "expired", "delivery_failed"];

export function statusTone(s: OrderStatus) {
  if (s === "delivered" || s === "completed") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (["cancelled", "rejected", "expired", "delivery_failed"].includes(s)) return "bg-red-50 text-red-800 border-red-200";
  if (s === "pending_confirmation") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-sky-50 text-sky-800 border-sky-200";
}

export const PICKUP_STEPS: OrderStatus[] = ["pending_confirmation", "confirmed", "preparing", "ready_for_pickup", "completed"];
export const DELIVERY_STEPS: OrderStatus[] = ["pending_confirmation", "confirmed", "preparing", "awaiting_courier", "courier_assigned", "in_delivery", "delivered"];

/** Statuts depuis lesquels le client peut annuler (miroir de advance_order en base). */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ["pending_confirmation", "confirmed", "preparing", "ready_for_pickup", "awaiting_courier"];

export const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Non payé",
  paid: "Paiement reçu (confirmé)",
  refund_pending: "Remboursement à effectuer",
  refunded: "Remboursé",
};
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pay_at_pharmacy: "Paiement à la pharmacie",
  cash_on_delivery: "Paiement à la livraison",
};
