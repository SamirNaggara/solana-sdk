-- Migration to add accessibilityLevel columns for proper hash calculation consistency

-- Add accessibilityLevel columns to dpp_products table
ALTER TABLE dpp_products
ADD COLUMN IF NOT EXISTS product_name_access_level VARCHAR(10) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS date_of_manufacture_access_level VARCHAR(10) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS place_of_manufacture_access_level VARCHAR(10) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS product_category_access_level VARCHAR(10) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS repairability_score_access_level VARCHAR(10) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS end_of_life_instructions_access_level VARCHAR(10) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS digital_link_access_level VARCHAR(10) DEFAULT 'public';

-- Add accessibilityLevel columns to manufacturers table for manufacturer data
ALTER TABLE manufacturers
ADD COLUMN IF NOT EXISTS name_access_level VARCHAR(10) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS address_access_level VARCHAR(10) DEFAULT 'owner',
ADD COLUMN IF NOT EXISTS contact_email_access_level VARCHAR(10) DEFAULT 'owner';

-- Add accessibilityLevel columns to material_compositions table
ALTER TABLE material_compositions
ADD COLUMN IF NOT EXISTS material_access_level VARCHAR(10) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS percentage_access_level VARCHAR(10) DEFAULT 'public';

-- Add accessibilityLevel columns to hazardous_substances table
ALTER TABLE hazardous_substances
ADD COLUMN IF NOT EXISTS substance_access_level VARCHAR(10) DEFAULT 'private',
ADD COLUMN IF NOT EXISTS cas_number_access_level VARCHAR(10) DEFAULT 'private',
ADD COLUMN IF NOT EXISTS concentration_access_level VARCHAR(10) DEFAULT 'private';

-- Add constraints to ensure valid accessibilityLevel values
DO $$
BEGIN
    -- Add constraints to dpp_products table
    BEGIN
        ALTER TABLE dpp_products ADD CONSTRAINT check_product_name_access_level
            CHECK (product_name_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE dpp_products ADD CONSTRAINT check_date_of_manufacture_access_level
            CHECK (date_of_manufacture_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE dpp_products ADD CONSTRAINT check_place_of_manufacture_access_level
            CHECK (place_of_manufacture_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE dpp_products ADD CONSTRAINT check_product_category_access_level
            CHECK (product_category_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE dpp_products ADD CONSTRAINT check_repairability_score_access_level
            CHECK (repairability_score_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE dpp_products ADD CONSTRAINT check_end_of_life_instructions_access_level
            CHECK (end_of_life_instructions_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE dpp_products ADD CONSTRAINT check_digital_link_access_level
            CHECK (digital_link_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- Add constraints to manufacturers table
    BEGIN
        ALTER TABLE manufacturers ADD CONSTRAINT check_name_access_level
            CHECK (name_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE manufacturers ADD CONSTRAINT check_address_access_level
            CHECK (address_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE manufacturers ADD CONSTRAINT check_contact_email_access_level
            CHECK (contact_email_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- Add constraints to material_compositions table
    BEGIN
        ALTER TABLE material_compositions ADD CONSTRAINT check_material_access_level
            CHECK (material_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE material_compositions ADD CONSTRAINT check_percentage_access_level
            CHECK (percentage_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- Add constraints to hazardous_substances table
    BEGIN
        ALTER TABLE hazardous_substances ADD CONSTRAINT check_substance_access_level
            CHECK (substance_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE hazardous_substances ADD CONSTRAINT check_cas_number_access_level
            CHECK (cas_number_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE hazardous_substances ADD CONSTRAINT check_concentration_access_level
            CHECK (concentration_access_level IN ('public', 'owner', 'private'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;