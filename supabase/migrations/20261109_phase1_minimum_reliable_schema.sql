-- =============================================================================
-- Migration: Phase 1 Minimum Reliable Database Structure (DEFERRED / REFERENCE ONLY)
-- Status: NOT EXECUTED - HELD PENDING PRODUCTION VPS DEPLOYMENT
-- Target: Reference schema for future PostgreSQL database (VPS / Supabase)
-- Description:
--   1. Creates public.restaurants (strict registry, no unverified auto-creation)
--   2. Creates public.menu_items (basic POS item to catalog mapping)
--   3. Creates public.sales_orders (normalized order headers)
--   4. Creates public.sales_order_items (line items per order)
--   5. Adds foreign key and tracking columns to public.petpooja_webhook_events
--   6. Enables Row-Level Security (RLS) on all tables with server-only access
--
-- Execution Policy:
--   DO NOT EXECUTE. Preserved solely as an architectural reference.
--   Final database provisioning will occur during the Hostinger VPS deployment phase.
-- =============================================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Table: public.restaurants
-- Strict registry of authorized restaurant outlets.
-- Unknown restaurant IDs are never auto-created from raw events.
-- (No unverified automatic seed; ready for confirmed Gulmohar outlet credentials)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    petpooja_rest_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NULL,
    contact_phone TEXT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_restaurants_petpooja_id UNIQUE (petpooja_rest_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurants_petpooja_id ON public.restaurants (petpooja_rest_id);

-- Enable RLS: Locked down from anon/public clients; accessible via server secret key (service_role)
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Table: public.menu_items
-- Basic product catalog mapping Petpooja POS items to internal dish names and costs.
-- UNKNOWN food_cost is NULL, NEVER zero.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    petpooja_item_id TEXT NOT NULL,
    item_code TEXT NULL,
    name TEXT NOT NULL,
    category_name TEXT NULL,
    current_price NUMERIC(12, 2) NULL,
    food_cost NUMERIC(12, 2) NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_menu_items_rest_item UNIQUE (restaurant_id, petpooja_item_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_items_rest_code ON public.menu_items (restaurant_id, item_code);

-- Enable RLS
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Table: public.sales_orders
-- Normalized order headers. Relates 1:N to petpooja_webhook_events.
-- Preserves original Petpooja fields alongside operational metrics.
-- Missing monetary values remain NULL (never auto-coerced into 0.00).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    petpooja_order_id TEXT NOT NULL,
    customer_invoice_id TEXT NULL,
    ref_id TEXT NULL,
    order_date DATE NOT NULL,
    ordered_at TIMESTAMPTZ NOT NULL,
    order_type TEXT NOT NULL,
    order_from TEXT NOT NULL,
    sub_order_type TEXT NULL,
    table_no TEXT NULL,
    status TEXT NOT NULL DEFAULT 'Success',
    cancel_reason TEXT NULL,
    payment_type TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'unknown',
    has_payment_breakdown BOOLEAN NOT NULL DEFAULT false,
    core_total NUMERIC(12, 2) NULL,
    discount_total NUMERIC(12, 2) NULL,
    tax_total NUMERIC(12, 2) NULL,
    delivery_charges NUMERIC(12, 2) NULL,
    packaging_charges NUMERIC(12, 2) NULL,
    service_charges NUMERIC(12, 2) NULL,
    round_off NUMERIC(12, 2) NULL,
    total_amount NUMERIC(12, 2) NULL,
    financial_status TEXT NOT NULL DEFAULT 'pending',
    reconciliation_difference NUMERIC(12, 2) NULL,
    matching_status TEXT NOT NULL DEFAULT 'unmatched',
    source_api TEXT NOT NULL DEFAULT 'global_webhook',
    matching_evidence JSONB NULL,
    latest_raw_event_id BIGINT NULL,
    first_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_sales_orders_financial_status CHECK (financial_status IN ('pending', 'reconciled', 'mismatch', 'not_computable')),
    CONSTRAINT chk_sales_orders_matching_status CHECK (matching_status IN ('unmatched', 'matched', 'ambiguous_match', 'manual_review')),
    CONSTRAINT chk_sales_orders_payment_status CHECK (payment_status IN ('unknown', 'settled', 'unsettled', 'partially_settled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_rest_date ON public.sales_orders (restaurant_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_petpooja_id ON public.sales_orders (restaurant_id, petpooja_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_ordered_at ON public.sales_orders (ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_matching_status ON public.sales_orders (matching_status) WHERE matching_status != 'matched';

-- Enable RLS
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Table: public.sales_order_items
-- Order line items preserving price, quantity, item tax, and item discount.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    petpooja_item_id TEXT NOT NULL,
    item_code TEXT NULL,
    item_name TEXT NOT NULL,
    category_name TEXT NULL,
    quantity NUMERIC(10, 3) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) NULL,
    discount_amount NUMERIC(12, 2) NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.sales_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_petpooja_item ON public.sales_order_items (petpooja_item_id);

-- Enable RLS
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 5. Alter: public.petpooja_webhook_events
-- Safe additive columns preserving all existing records in Supabase.
-- -----------------------------------------------------------------------------
ALTER TABLE public.petpooja_webhook_events
    ADD COLUMN IF NOT EXISTS petpooja_rest_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS sales_order_id UUID NULL,
    ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS locked_by TEXT NULL,
    ADD COLUMN IF NOT EXISTS lease_token UUID NULL,
    ADD COLUMN IF NOT EXISTS last_error TEXT NULL,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS duplicate_of_event_id BIGINT NULL;

-- Safe foreign keys without cyclical creation conflicts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_webhook_events_sales_order'
          AND table_name = 'petpooja_webhook_events'
    ) THEN
        ALTER TABLE public.petpooja_webhook_events
            ADD CONSTRAINT fk_webhook_events_sales_order
            FOREIGN KEY (sales_order_id)
            REFERENCES public.sales_orders(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_sales_orders_raw_event'
          AND table_name = 'sales_orders'
    ) THEN
        ALTER TABLE public.sales_orders
            ADD CONSTRAINT fk_sales_orders_raw_event
            FOREIGN KEY (latest_raw_event_id)
            REFERENCES public.petpooja_webhook_events(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_webhook_events_claim ON public.petpooja_webhook_events (processing_status, received_at ASC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_sales_order ON public.petpooja_webhook_events (sales_order_id);
