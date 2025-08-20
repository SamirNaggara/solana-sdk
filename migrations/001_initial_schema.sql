-- Initial database schema for digital product passports (DPP)

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Manufacturers table
CREATE TABLE IF NOT EXISTS manufacturers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR NOT NULL,
    address VARCHAR NOT NULL,
    contact_email VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster manufacturer lookups
CREATE INDEX IF NOT EXISTS idx_manufacturers_name_email ON manufacturers(name, contact_email);

-- DPP Products table
CREATE TABLE IF NOT EXISTS dpp_products (
    "productId" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_name VARCHAR NOT NULL,
    date_of_manufacture TIMESTAMP NOT NULL,
    place_of_manufacture VARCHAR NOT NULL,
    product_category VARCHAR NOT NULL,
    repairability_score DECIMAL,
    end_of_life_instructions TEXT NOT NULL,
    digital_link VARCHAR NOT NULL,
    manufacturer_id UUID NOT NULL REFERENCES manufacturers(id),
    signature VARCHAR NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Material compositions table
CREATE TABLE IF NOT EXISTS material_compositions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material VARCHAR NOT NULL,
    percentage DECIMAL NOT NULL,
    product_id UUID NOT NULL REFERENCES dpp_products("productId") ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hazardous substances table
CREATE TABLE IF NOT EXISTS hazardous_substances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    substance VARCHAR NOT NULL,
    cas_number VARCHAR NOT NULL,
    concentration DECIMAL NOT NULL,
    product_id UUID NOT NULL REFERENCES dpp_products("productId") ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DPP Product history table
CREATE TABLE IF NOT EXISTS dpp_product_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES dpp_products("productId") ON DELETE CASCADE,
    action VARCHAR NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    changed_by VARCHAR NOT NULL,
    change_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    previous_data JSONB,
    new_data JSONB,
    change_description TEXT
);

-- Create indexes for history table
CREATE INDEX IF NOT EXISTS idx_history_product_id ON dpp_product_history(product_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON dpp_product_history(change_timestamp);

-- DPP Product visibility table
CREATE TABLE IF NOT EXISTS dpp_product_visibility (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES dpp_products("productId") ON DELETE CASCADE,
    public JSONB,
    owner JSONB,
    brand JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for visibility table
CREATE INDEX IF NOT EXISTS idx_visibility_product_id ON dpp_product_visibility(product_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_manufacturers_updated_at BEFORE UPDATE ON manufacturers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dpp_products_updated_at BEFORE UPDATE ON dpp_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_visibility_updated_at BEFORE UPDATE ON dpp_product_visibility
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
