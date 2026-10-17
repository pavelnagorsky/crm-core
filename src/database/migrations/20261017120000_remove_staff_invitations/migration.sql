-- Old pending staff invitations were revoked when generic access grants were introduced.
-- AccessInvitation and AccessInvitationGrant are now the only invitation models.
DROP TABLE "StaffInvitation";
DROP TYPE "StaffInvitationStatus";
