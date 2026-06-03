/**
 * Role-based default visibility for a party added to a deal.
 *
 * When a realtor adds someone to a deal, the four can_view_* flags should
 * default sensibly by ROLE — a lender needs documents + dates + financials
 * but not the buyer-side message thread; an inspector needs only the dates;
 * a co-realtor or attorney is a full collaborator. The realtor can always
 * override the individual checkboxes; this just sets the starting point.
 *
 * Shared by:
 *   - ParticipantModal (client UI — seeds the checkboxes on role change)
 *   - addParticipantAction (server action — fallback when flags are undefined)
 *   - POST /api/participants/add (mobile route — same fallback)
 *
 * Keep this the single source of truth so the UI and both write paths agree.
 */

export type PartyRole =
  | 'realtor'
  | 'co_realtor'
  | 'buyer'
  | 'seller'
  | 'attorney'
  | 'inspector'
  | 'lender'
  | 'appraiser'
  | 'title_agent'
  | 'mortgage_broker'
  | 'other';

export type PartyPermissions = {
  can_view_documents: boolean;
  can_view_financials: boolean;
  can_view_messages: boolean;
  can_view_dates: boolean;
};

/**
 * Return the default can_view_* flags for a given party role.
 *
 * Defaults table:
 *   co_realtor                       docs T · dates T · messages T · financials T
 *   attorney                         docs T · dates T · messages T · financials T
 *   buyer / seller                   docs T · dates T · messages T · financials T
 *   lender / mortgage_broker /
 *     title_agent                    docs T · dates T · messages F · financials T
 *   inspector / appraiser            docs F · dates T · messages F · financials F
 *   other                            docs F · dates T · messages F · financials F
 */
export function defaultPartyPermissions(role: string): PartyPermissions {
  switch (role) {
    case 'co_realtor':
    case 'attorney':
    case 'buyer':
    case 'seller':
      return {
        can_view_documents: true,
        can_view_dates: true,
        can_view_messages: true,
        can_view_financials: true,
      };
    case 'lender':
    case 'mortgage_broker':
    case 'title_agent':
      return {
        can_view_documents: true,
        can_view_dates: true,
        can_view_messages: false,
        can_view_financials: true,
      };
    case 'inspector':
    case 'appraiser':
      return {
        can_view_documents: false,
        can_view_dates: true,
        can_view_messages: false,
        can_view_financials: false,
      };
    case 'other':
    default:
      return {
        can_view_documents: false,
        can_view_dates: true,
        can_view_messages: false,
        can_view_financials: false,
      };
  }
}
