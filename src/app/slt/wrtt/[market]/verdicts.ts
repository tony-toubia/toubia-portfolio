/**
 * The confirm step's vocabulary, matching the check constraint on
 * wrtt.feedback. Five verdicts because the two ways a card can be wrong are
 * different: "reject" is the right person and the wrong audience, which is a
 * scoring lesson; "wrong_person" is a resolution failure, which is an
 * identity lesson. Conflating them would teach the model the wrong thing.
 */
export const VERDICTS = ['confirm', 'reject', 'already_known', 'wrong_person', 'do_not_contact'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  confirm: 'Confirm',
  reject: 'Not the audience',
  already_known: 'Already known',
  wrong_person: 'Wrong person',
  do_not_contact: 'Do not contact',
};

export const VERDICT_HINT: Record<Verdict, string> = {
  confirm: 'This is the kind of person the index exists to find.',
  reject: 'Right person, wrong profile – the establishment circuit, a professional, not a grassroots organizer.',
  already_known: 'Already a publisher, applicant or contact. Useful as a hit, not a lead.',
  wrong_person: 'The filings behind this card belong to someone else with this name.',
  do_not_contact: 'Has asked not to be contacted, or should not be for another reason.',
};

/** Verdicts that mean "take this card out of the running". */
export const NEGATIVE = new Set<Verdict>(['reject', 'wrong_person', 'do_not_contact']);
