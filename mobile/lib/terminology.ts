/**
 * Firm-type-aware wording. One vocabulary for brokerages, one for law
 * practices, so an attorney never reads "your brokerage" or "invite an
 * agent" inside their own firm. Screens pass userProfile?.firm_type.
 */
export function firmNouns(firmType?: string | null) {
  const law = firmType === 'law_firm';
  return {
    law,
    /** "agent" / "attorney" */
    staff: law ? 'attorney' : 'agent',
    /** "agents" / "attorneys" */
    staffPlural: law ? 'attorneys' : 'agents',
    /** "brokerage" / "practice" */
    firmNoun: law ? 'practice' : 'brokerage',
    /** "Realtor" / "Attorney" — title-cased role word */
    roleTitle: law ? 'Attorney' : 'Realtor',
  };
}
