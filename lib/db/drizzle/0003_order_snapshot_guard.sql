-- Orders keep an immutable snapshot of prices, wilaya and delivery fee.
-- Status changes and address corrections stay allowed; changing what the
-- customer was charged or where the fee came from is rejected.
CREATE OR REPLACE FUNCTION "orders_snapshot_guard"() RETURNS trigger AS $$
BEGIN
  IF NEW."order_number" IS DISTINCT FROM OLD."order_number"
     OR NEW."payment_method" IS DISTINCT FROM OLD."payment_method"
     OR NEW."subtotal_dzd" IS DISTINCT FROM OLD."subtotal_dzd"
     OR NEW."shipping_fee_dzd" IS DISTINCT FROM OLD."shipping_fee_dzd"
     OR NEW."total_dzd" IS DISTINCT FROM OLD."total_dzd"
     OR NEW."wilaya_id" IS DISTINCT FROM OLD."wilaya_id"
     OR NEW."wilaya_code" IS DISTINCT FROM OLD."wilaya_code"
     OR NEW."wilaya_name" IS DISTINCT FROM OLD."wilaya_name"
     OR NEW."wilaya_name_ar" IS DISTINCT FROM OLD."wilaya_name_ar"
     OR NEW."delivery_type" IS DISTINCT FROM OLD."delivery_type"
     OR NEW."delivery_rate_snapshot" IS DISTINCT FROM OLD."delivery_rate_snapshot"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'order snapshot is immutable (order %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "orders_snapshot_guard"
  BEFORE UPDATE ON "orders"
  FOR EACH ROW EXECUTE FUNCTION "orders_snapshot_guard"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "order_items_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'order items are immutable (item %)', OLD."id"
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "order_items_immutable"
  BEFORE UPDATE ON "order_items"
  FOR EACH ROW EXECUTE FUNCTION "order_items_immutable"();
