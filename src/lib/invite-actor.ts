// Omitting an absent email invokes the SQL DEFAULT NULL, preserving the audit value.
export function inviteActorArgs(invitationId: string, actor: string, email: string | null | undefined) {
  return { _invitation_id: invitationId, _actor: actor, ...(email == null ? {} : { _actor_email: email }) };
}