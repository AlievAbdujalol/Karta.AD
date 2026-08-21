import { createClient } from "@supabase/supabase-js";

export type DeliveryStatus =
  | "pending"
  | "searching"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface AddressPoint {
  lat: number;
  lng: number;
  address?: string;
}

export interface OrderItem {
  name: string;
  qty: number;
  price?: number;
  weight_kg?: number;
}

export interface Customer {
  name: string;
  phone: string;
}

export interface CreateOrderParams {
  customer: Customer;
  pickup: AddressPoint;
  dropoff: AddressPoint;
  items: OrderItem[];
  external_id?: string;
  notes?: string;
  payment_method?: "cash" | "card" | "wallet";
}

export interface CreateOrderResult {
  id: string;
  order_number: number;
  price: number;
  total: number;
  distance_km: number;
  eta_min: number;
  status: DeliveryStatus;
  created_at: string;
}

export interface TrackedOrder {
  id: string;
  order_number: number;
  status: DeliveryStatus;
  price: number;
  pickup_address: string | null;
  dropoff_address: string | null;
  recipient_name: string | null;
  courier_id: string | null;
  eta_min: number | null;
  payment_status: string;
  created_at: string;
  updated_at: string;
  tracking: Array<{
    status: DeliveryStatus;
    lat: number | null;
    lng: number | null;
    note: string | null;
    created_at: string;
  }>;
}

export interface PriceQuote {
  distance_km: number;
  price: number;
  currency: string;
  eta_min: number;
}

export interface DeliveryOptions {
  apiKey: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  baseUrl?: string;
  sandbox?: boolean;
}

export interface ApiError {
  error: string;
  message?: string;
}

export class DeliveryError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "DeliveryError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_SUPABASE_URL = "https://eotkmnwneivithfkweds.supabase.co";

/**
 * Karta-AD Delivery SDK
 *
 * ```ts
 * import { Delivery } from "@karta-ad/delivery";
 *
 * const delivery = new Delivery({ apiKey: "dk_xxx" });
 * const order = await delivery.createOrder({ ... });
 * ```
 */
export class Delivery {
  private readonly apiKey: string;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey?: string;
  private readonly baseUrl: string;
  private readonly sandbox: boolean;
  private sb?: import("@supabase/supabase-js").SupabaseClient;

  constructor(options: DeliveryOptions) {
    if (!options.apiKey) {
      throw new DeliveryError("MISSING_API_KEY", "apiKey is required", 400);
    }
    this.apiKey = options.apiKey;
    this.supabaseUrl = options.supabaseUrl || DEFAULT_SUPABASE_URL;
    this.supabaseAnonKey = options.supabaseAnonKey;
    this.sandbox = options.sandbox === true;
    this.baseUrl = options.baseUrl || `${this.supabaseUrl}/functions/v1/delivery-api`;
  }

  private get client() {
    if (!this.sb) {
      if (!this.supabaseAnonKey) {
        throw new DeliveryError("MISSING_ANON_KEY", "supabaseAnonKey is required for supabase mode", 400);
      }
      this.sb = createClient(this.supabaseUrl, this.supabaseAnonKey);
    }
    return this.sb;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = data as ApiError;
      throw new DeliveryError(err.error || "HTTP_ERROR", err.message || res.statusText, res.status);
    }
    return data as T;
  }

  /**
   * Создать заказ доставки
   */
  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const res = await this.request<{ success: boolean; order: CreateOrderResult }>(
      "POST",
      "/api/v1/orders",
      params,
    );
    return res.order;
  }

  /**
   * Получить заказ полностью (заказ + позиции + трекинг)
   */
  async getOrder(orderId: string): Promise<TrackedOrder> {
    const res = await this.request<{ success: boolean; order: TrackedOrder }>(
      "GET",
      `/api/v1/orders/${orderId}`,
    );
    return res.order;
  }

  /**
   * Получить статус заказа (компактный)
   */
  async getStatus(orderId: string): Promise<DeliveryStatus> {
    const res = await this.request<{ success: boolean; order: { status: DeliveryStatus } }>(
      "GET",
      `/api/v1/status/${orderId}`,
    );
    return res.order.status;
  }

  /**
   * Отменить заказ
   */
  async cancelOrder(orderId: string, reason?: string): Promise<{ success: boolean; status: string }> {
    return this.request("POST", "/api/v1/cancel", {
      order_id: orderId,
      reason,
    });
  }

  /**
   * Рассчитать цену доставки
   */
  async calculatePrice(pickup: Coordinates, dropoff: Coordinates, weightKg = 0): Promise<PriceQuote> {
    const res = await this.request<{ success: boolean; distance_km: number; price: number; currency: string; eta_min: number }>(
      "POST",
      "/api/v1/calculate-price",
      {
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        weight_kg: weightKg,
      },
    );
    return {
      distance_km: res.distance_km,
      price: res.price,
      currency: res.currency,
      eta_min: res.eta_min,
    };
  }

  /**
   * Список заказов магазина (последние 50)
   */
  async listOrders() {
    const res = await this.request<{ success: boolean; orders: TrackedOrder[] }>(
      "GET",
      "/api/v1/orders",
    );
    return res.orders;
  }

  /**
   * Реальное время: слушать изменения статуса заказа
   */
  subscribeOrder(orderId: string, cb: (status: DeliveryStatus) => void): () => void {
    if (!this.supabaseAnonKey) {
      throw new DeliveryError("MISSING_ANON_KEY", "supabaseAnonKey is required for realtime", 400);
    }
    const channel = this.client
      .channel(`delivery-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "delivery_orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          cb(payload.new.status as DeliveryStatus);
        },
      )
      .subscribe();

    return () => {
      supabaseChannelRemove(channel);
    };
  }

  /**
   * Проверить подпись вебхука от Karta-AD (async — Web Crypto)
   */
  static async verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    try {
      const expected = `sha256=${await hmacSha256HexRaw(payload, secret)}`;
      return expected === signature;
    } catch {
      return false;
    }
  }
}

function supabaseChannelRemove(channel: { unsubscribe: () => void }) {
  try { channel.unsubscribe(); } catch { /* noop */ }
}

async function hmacSha256HexRaw(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
