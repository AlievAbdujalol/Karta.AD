export type UserRole = 'passenger' | 'driver' | 'admin' | 'user';
export type VehicleType = 'bus' | 'minibus';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  photo_url: string | null;
  role: UserRole;
  driver_status: string | null;
  vehicle_number: string | null;
  created_at: string;
  updated_at: string;
  phone: string | null;
  balance: number;
  subscription_status: string | null;
  subscription_start_date: string | null;
  subscription_next_billing: string | null;
  subscription_paid_until: string | null;
  bio: string | null;
  language: string | null;
  city_id: string | null;
  admin_activated: boolean;
}

export interface Vehicle {
  id: string;
  driver_id: string | null;
  driver_name: string | null;
  route_id: string | null;
  route_number: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  speed: number | null;
  last_updated: string | null;
  vehicle_number: string | null;
  type: VehicleType | null;
  created_at: string | null;
}

export interface Route {
  id: string;
  number: string;
  name: string | null;
  type: VehicleType | null;
  city_id: string | null;
  city_name: string | null;
  color: string | null;
  stops: Record<string, any> | null;
  is_active: boolean;
  created_at: string | null;
}

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  created_at: string | null;
}

export interface Review {
  id: string;
  route_id: string | null;
  route_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_number: string | null;
  cleanliness: number | null;
  politeness: number | null;
  punctuality: number | null;
  comment: string | null;
  city_id: string | null;
  created_by_id: string | null;
  created_at: string | null;
}

export interface Schedule {
  id: string;
  route_id: string | null;
  route_number: string | null;
  city_id: string | null;
  stops_schedule: Record<string, any> | null;
  created_at: string | null;
}

export interface FavoriteRoute {
  id: string;
  user_id: string;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  route_type: string | null;
  city_name: string | null;
  route_color: string | null;
  created_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  body: string;
  type: string;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  sender_id: string | null;
  recipient_id: string | null;
  amount: number;
  status: string;
  created_at: string;
}

export interface TripLog {
  id: string;
  user_id: string;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  city_name: string | null;
  route_color: string | null;
  route_type: string | null;
  created_at: string | null;
}

export interface SubscriptionPayment {
  id: string;
  user_id: string;
  amount: number;
  role: string;
  payment_type: string;
  status: string;
  created_at: string | null;
}

export type Tables =
  | 'profiles'
  | 'vehicles'
  | 'routes'
  | 'cities'
  | 'reviews'
  | 'schedules'
  | 'favorite_routes'
  | 'notifications'
  | 'transactions'
  | 'trip_logs'
  | 'subscription_payments';

export type ProfileInsert = Omit<Profile, 'id' | 'created_at' | 'updated_at'> & { id?: string };
export type VehicleInsert = Omit<Vehicle, 'id' | 'created_at'> & { id?: string };
export type RouteInsert = Omit<Route, 'id' | 'created_at'> & { id?: string };
export type ReviewInsert = Omit<Review, 'id' | 'created_at'> & { id?: string };
export type TransactionInsert = Omit<Transaction, 'id' | 'created_at'> & { id?: string };
