-- PHASE 10: CRM POWER-UPS MIGRATION

-- 1. Create Tag Definitions Table
CREATE TABLE IF NOT EXISTS tag_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    colour TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Message Templates Table
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add Follow-Up fields to Contacts
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS follow_up_note TEXT;

-- 4. Enable Realtime for Tag Definitions (Optional but good for autocomplete sync)
ALTER PUBLICATION supabase_realtime ADD TABLE tag_definitions;

-- 5. Insert some initial tag colours if desired
INSERT INTO tag_definitions (name, colour) 
VALUES 
('Hot Lead', '#EF4444'),
('Warm Lead', '#F59E0B'),
('Cold Lead', '#3B82F6'),
('VIP', '#8B5CF6'),
('Purchased', '#10B981')
ON CONFLICT (name) DO NOTHING;
