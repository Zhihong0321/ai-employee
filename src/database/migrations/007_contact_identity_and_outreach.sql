ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS whatsapp_lid TEXT,
ADD COLUMN IF NOT EXISTS autonomous_outreach BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_whatsapp_lid_uidx
ON contacts (whatsapp_lid)
WHERE whatsapp_lid IS NOT NULL;
