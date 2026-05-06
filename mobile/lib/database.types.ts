export type UserRole = 'super_admin' | 'realtor' | 'client';
export type DealPhase = 'searching' | 'offer_made' | 'under_contract' | 'closing' | 'closed';
export type HouseStatus = 'interested' | 'tour_requested' | 'toured' | 'offered' | 'passed';

export type Firm = {
  id: string;
  name: string;
  // 0003 migration introduced `subdomain` (replacing `slug`) and richer
  // branding columns. Legacy fields are kept optional so older rows still parse.
  subdomain?: string | null;
  slug?: string | null;
  logo_url: string | null;
  brand_color?: string | null;
  accent_color?: string | null;
  primary_color?: string | null;     // legacy alias of brand_color
  secondary_color?: string | null;   // legacy alias of accent_color
  tagline?: string | null;
  contact_email: string | null;
  contact_phone?: string | null;
  website_url?: string | null;
  status?: 'trial' | 'active' | 'suspended' | 'cancelled' | null;
  is_active?: boolean | null;        // legacy
  trial_ends_at?: string | null;
  onboarding_completed?: boolean | null;
  created_at: string;
  updated_at?: string;
};

export type User = {
  id: string;
  firm_id: string | null;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

// Same shape as User but kept as a separate alias for future divergence
// (e.g. when we join in firm details). queries.ts and auth.tsx both reference it.
export type UserProfile = User;

export type ClientSearch = {
  id: string;
  firm_id: string;
  client_id: string;
  realtor_id: string;
  name: string;
  description: string | null;
  phase: DealPhase;
  started_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type House = {
  id: string;
  firm_id: string;
  search_id: string;
  address: string;
  list_price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  listing_url: string | null;
  photo_url: string | null;
  notes: string | null;
  is_favorite: boolean;
  toured_at: string | null;
  status: HouseStatus;
  created_at: string;
};

export type HouseRating = {
  id: string;
  firm_id: string;
  house_id: string;
  search_id: string;
  client_id: string;
  stars: number;            // 1–5
  notes: string | null;
  requested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TourRequest = {
  id: string;
  firm_id: string;
  house_id: string;
  search_id: string;
  client_id: string;
  preferred_when: string | null;
  notes: string | null;
  handled_at: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  firm_id: string;
  search_id: string;
  actor_id: string;
  action: string;
  target: string;
  metadata: Record<string, any> | null;
  created_at: string;
};

export type ImportantDate = {
  id: string;
  firm_id: string;
  search_id: string;
  label: string;
  date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Document = {
  id: string;
  firm_id: string;
  search_id: string;
  name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  firm_id: string;
  search_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type PushToken = {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android';
  last_seen_at: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      firms: { Row: Firm };
      users: { Row: User };
      client_searches: { Row: ClientSearch };
      houses: { Row: House };
      house_ratings: { Row: HouseRating };
      tour_requests: { Row: TourRequest };
      activities: { Row: Activity };
      important_dates: { Row: ImportantDate };
      documents: { Row: Document };
      messages: { Row: Message };
      push_tokens: { Row: PushToken };
    };
  };
};
