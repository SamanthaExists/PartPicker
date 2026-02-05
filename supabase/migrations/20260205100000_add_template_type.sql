-- Add template_type column to distinguish BOM vs Assembly templates
ALTER TABLE bom_templates ADD COLUMN IF NOT EXISTS template_type TEXT DEFAULT 'bom';

-- Create index for filtering by type
CREATE INDEX IF NOT EXISTS idx_bom_templates_type ON bom_templates(template_type);

-- Update existing templates to have 'bom' type (should already be default but explicit)
UPDATE bom_templates SET template_type = 'bom' WHERE template_type IS NULL;
